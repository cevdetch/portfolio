import type { ContributionOverrides } from '../schemas/contributions.ts';
import type { PackageRef } from '../schemas/work.ts';
import type { Client } from './client.ts';
import type { Contribution, RepoFacts, Snapshot, WorkFacts } from './schema.ts';
import {
  contributionsQuery, countDiscussion, GITHUB_API, HANDLE, lastPage, toContribution, toPkgbuilds, toRepoFacts, toRuleCounts, toRuleFiles,
  type GhBlob, type GhComment, type GhCommit, type GhRelease, type GhRepo, type GhSearch, type GhTree,
} from './sources/github.ts';
import { checkSvg, sha256 } from './sources/icons.ts';
import { toAurFacts, toNpmFacts, type AurInfo, type NpmDoc } from './sources/registries.ts';

export interface WorkSource { id: string; repo?: string; site?: string; packages: readonly PackageRef[]; pkgbuilds: boolean; rules?: boolean }
export interface CollectOptions { highlights?: readonly string[]; previous?: Snapshot | undefined }
export interface Collected { works: Record<string, WorkFacts>; contributions: Contribution[]; icons: { workId: string; svg: string }[] }

async function required<T>(client: Client, url: string): Promise<{ data: T; headers: Headers }> {
  const result = await client.json<T>(url);
  if (!result) throw new Error(`${url}: not found`);
  return result;
}

interface RepoResult { facts: RepoFacts; pkgbuilds?: string[]; rules?: WorkFacts['rules'] }

/** Reads each rule file's blob, a few at a time, at the given ref, and counts the rules and the head-scoped ones. */
async function ruleCounts(client: Client, repo: string, ref: string): Promise<NonNullable<WorkFacts['rules']>> {
  const files = toRuleFiles((await required<GhTree>(client, `${GITHUB_API}/repos/${repo}/git/trees/${ref}?recursive=1`)).data);
  if (files.length === 0) throw new Error(`${repo}@${ref}: no rule files under content/rules`);
  const texts: string[] = [];
  for (let i = 0; i < files.length; i += 8) {
    texts.push(...await Promise.all(files.slice(i, i + 8).map(async file => {
      const { data } = await required<GhBlob>(client, `${GITHUB_API}/repos/${repo}/git/blobs/${file.sha}`);
      if (data.encoding !== 'base64') throw new Error(`${repo}/${file.path}: unexpected blob encoding ${data.encoding}`);
      return Buffer.from(data.content, 'base64').toString('utf8');
    })));
  }
  return toRuleCounts(texts);
}

async function repoFacts(client: Client, source: WorkSource & { repo: string }, previous: Snapshot | undefined): Promise<RepoResult> {
  const url = `${GITHUB_API}/repos/${source.repo}`;
  const found = await client.json<GhRepo>(url);
  if (!found) {
    // The scheduled refresh's token sees public repositories only, so a private one answers 404 there. Keep the
    // privacy a refresh with the owner's token recorded; any other 404 is a wrong repo in the Story.
    if (previous?.works[source.id]?.repo?.private) return { facts: { private: true } };
    throw new Error(`${url}: not found`);
  }
  const repo = found.data;
  if (repo.private) return { facts: { private: true } };
  const commits = `${GITHUB_API}/repos/${source.repo}/commits?sha=${repo.default_branch}&per_page=1`;
  const first = await required<GhCommit[]>(client, commits);
  const newest = first.data[0];
  if (!newest) throw new Error(`${source.repo}: no commits`);
  const count = lastPage(first.headers.get('link')) ?? first.data.length;
  const oldest = count > 1 ? (await required<GhCommit[]>(client, `${commits}&page=${count}`)).data[0]! : newest;
  const release = (await client.json<GhRelease>(`${GITHUB_API}/repos/${source.repo}/releases/latest`))?.data ?? null;
  const facts = toRepoFacts({ repo, newest, oldest, commitCount: count, release });
  const pkgbuilds = source.pkgbuilds
    ? toPkgbuilds((await required<GhTree>(client, `${GITHUB_API}/repos/${source.repo}/git/trees/${repo.default_branch}?recursive=1`)).data)
    : undefined;
  // The published catalogue: the latest release's tag, or the default branch before a first release. A tag never
  // moves, so the last counts stand while it is unchanged, sparing a few hundred blob requests a run.
  const before = previous?.works[source.id];
  const tag = facts.latestRelease?.tag;
  const kept = tag && before?.rules && before.repo && !before.repo.private && before.repo.latestRelease?.tag === tag ? before.rules : undefined;
  const rules = source.rules ? kept ?? await ruleCounts(client, source.repo, tag ?? repo.default_branch) : undefined;
  return { facts, ...(pkgbuilds ? { pkgbuilds } : {}), ...(rules ? { rules } : {}) };
}

async function packageFacts(client: Client, pkg: PackageRef) {
  if (pkg.registry === 'npm') {
    const doc = await client.json<NpmDoc>(`https://registry.npmjs.org/${pkg.name.replace('/', '%2F')}`);
    return toNpmFacts(pkg.name, doc?.data ?? null);
  }
  const info = await required<AurInfo>(client, `https://aur.archlinux.org/rpc/v5/info?arg[]=${encodeURIComponent(pkg.name)}`);
  return toAurFacts(pkg.name, info.data);
}

/** The Contribution highlights in contributions.yaml, as `owner/repo#number`. */
export function highlightedPulls(overrides: ContributionOverrides): string[] {
  return overrides.upstreams.flatMap(upstream => Object.entries(upstream.pulls)
    .filter(([, pull]) => pull.highlight).map(([number]) => `${upstream.repo}#${number}`));
}

async function allPages<T>(client: Client, url: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const { data } = await required<T[]>(client, `${url}?per_page=100&page=${page}`);
    items.push(...data);
    if (data.length < 100) return items;
  }
}

async function discussion(client: Client, c: Contribution): Promise<{ comments: number }> {
  const [reviews, reviewComments, issueComments] = await Promise.all([
    allPages<GhComment>(client, `${GITHUB_API}/repos/${c.upstream}/pulls/${c.number}/reviews`),
    allPages<GhComment>(client, `${GITHUB_API}/repos/${c.upstream}/pulls/${c.number}/comments`),
    allPages<GhComment>(client, `${GITHUB_API}/repos/${c.upstream}/issues/${c.number}/comments`),
  ]);
  return { comments: countDiscussion({ reviews, reviewComments, issueComments }, HANDLE) };
}

async function contributions(client: Client, highlights: ReadonlySet<string>): Promise<Contribution[]> {
  const found: Contribution[] = [];
  for (let page = 1; ; page++) {
    const url = `${GITHUB_API}/search/issues?q=${encodeURIComponent(contributionsQuery)}&per_page=100&page=${page}`;
    const { data } = await required<GhSearch>(client, url);
    if (data.total_count > 1000) throw new Error('More than 1000 Contributions; search cannot list them all.');
    found.push(...data.items.map(toContribution));
    if (data.items.length < 100) break;
  }
  // Only the pinned pulls: the count shows that a highlighted change went through maintainer review.
  for (const c of found) if (highlights.has(`${c.upstream}#${c.number}`)) c.discussion = await discussion(client, c);
  return found;
}

export async function collectFacts(sources: readonly WorkSource[], client: Client, options: CollectOptions = {}): Promise<Collected> {
  const works: Record<string, WorkFacts> = {};
  const icons: Collected['icons'] = [];
  for (const source of sources) {
    if (!source.repo && !source.site && source.packages.length === 0) continue;
    const facts: WorkFacts = { packages: [] };
    if (source.repo) {
      const { facts: repo, pkgbuilds, rules } = await repoFacts(client, { ...source, repo: source.repo }, options.previous);
      facts.repo = repo;
      if (pkgbuilds) facts.pkgbuilds = pkgbuilds;
      if (rules) facts.rules = rules;
    }
    for (const pkg of source.packages) facts.packages.push(await packageFacts(client, pkg));
    if (source.site) {
      const icon = await client.text(new URL('icon.svg', source.site).href);
      if (icon) {
        if (!icon.contentType.startsWith('image/svg+xml')) throw new Error(`${source.id}: /icon.svg is ${icon.contentType}, not image/svg+xml`);
        const problems = checkSvg(icon.body);
        if (problems.length) throw new Error(`${source.id}: /icon.svg rejected: ${problems.join(', ')}`);
        icons.push({ workId: source.id, svg: icon.body });
        facts.icon = { file: `icons/${source.id}.svg`, sha256: await sha256(icon.body) };
      } else {
        facts.icon = null;
      }
    }
    works[source.id] = facts;
  }
  return { works, contributions: await contributions(client, new Set(options.highlights)), icons };
}
