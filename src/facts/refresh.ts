import type { ContributionOverrides } from '../schemas/contributions.ts';
import type { PackageRef } from '../schemas/work.ts';
import type { Client } from './client.ts';
import type { Contribution, WorkFacts } from './schema.ts';
import {
  contributionsQuery, countDiscussion, GITHUB_API, HANDLE, lastPage, toContribution, toPkgbuilds, toRepoFacts,
  type GhComment, type GhCommit, type GhRelease, type GhRepo, type GhSearch, type GhTree,
} from './sources/github.ts';
import { checkSvg, sha256 } from './sources/icons.ts';
import { toAurFacts, toNpmFacts, type AurInfo, type NpmDoc } from './sources/registries.ts';

export interface WorkSource { id: string; repo?: string; site?: string; packages: readonly PackageRef[]; pkgbuilds: boolean }
export interface CollectOptions { highlights?: readonly string[] }
export interface Collected { works: Record<string, WorkFacts>; contributions: Contribution[]; icons: { workId: string; svg: string }[] }

async function required<T>(client: Client, url: string): Promise<{ data: T; headers: Headers }> {
  const result = await client.json<T>(url);
  if (!result) throw new Error(`${url}: not found`);
  return result;
}

async function repoFacts(client: Client, source: WorkSource & { repo: string }) {
  const { data: repo } = await required<GhRepo>(client, `${GITHUB_API}/repos/${source.repo}`);
  if (repo.private) throw new Error(`${source.id}: ${source.repo} is private; remove repo from its Story`);
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
  return { facts, pkgbuilds };
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
      const { facts: repo, pkgbuilds } = await repoFacts(client, { ...source, repo: source.repo });
      facts.repo = repo;
      if (pkgbuilds) facts.pkgbuilds = pkgbuilds;
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
