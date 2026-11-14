import type { Contribution, PublicRepoFacts } from '../schema.ts';

export const GITHUB_API = 'https://api.github.com';
export const HANDLE = 'cevdetch';
// Contributions: merged, authored by cevdetch, in public repositories cevdetch does not own.
export const contributionsQuery = 'is:pr is:merged is:public author:cevdetch -user:cevdetch';

export interface GhRepo { private: boolean; default_branch: string; license: { spdx_id: string } | null }
export interface GhCommit { commit: { author: { date: string } } }
export interface GhRelease { tag_name: string; published_at: string; draft: boolean }
export interface GhSearchItem { html_url: string; number: number; title: string; repository_url: string; pull_request?: { merged_at: string | null } }
export interface GhSearch { total_count: number; items: GhSearchItem[] }
export interface GhTree { truncated: boolean; tree: { path: string; type: 'blob' | 'tree' | 'commit'; sha?: string }[] }
export interface GhBlob { encoding: string; content: string }

export interface GhUser { login: string; type: string }
export interface GhComment { user: GhUser | null; body?: string | null }

// Bot accounts registered as ordinary users, so neither GitHub's type nor a [bot] suffix gives them away.
const userBots = new Set(['astrobot-houston']);

function isBot(user: GhUser): boolean {
  return user.type === 'Bot' || user.login.endsWith('[bot]') || userBots.has(user.login.toLowerCase());
}

/**
 * What other people wrote while reviewing a pull request: review summaries with a body, inline review comments and
 * conversation comments. The author's own replies, bots and bare approvals do not count.
 */
export function countDiscussion(input: { reviews: GhComment[]; reviewComments: GhComment[]; issueComments: GhComment[] }, author: string): number {
  const counts = (comment: GhComment) => comment.user !== null && !isBot(comment.user)
    && comment.user.login.toLowerCase() !== author.toLowerCase();
  return input.reviews.filter(review => counts(review) && Boolean(review.body?.trim())).length
    + input.reviewComments.filter(counts).length + input.issueComments.filter(counts).length;
}

export function lastPage(link: string | null): number | null {
  const last = link?.split(',').find(part => /rel="last"/.test(part));
  const url = last?.match(/<([^>]+)>/)?.[1];
  const page = url ? new URL(url).searchParams.get('page') : null;
  return page ? Number(page) : null;
}

export function toRepoFacts(input: { repo: GhRepo; newest: GhCommit; oldest: GhCommit; commitCount: number; release: GhRelease | null }): PublicRepoFacts {
  const spdx = input.repo.license?.spdx_id;
  return {
    private: false,
    license: spdx && spdx !== 'NOASSERTION' ? spdx : null,
    firstCommit: input.oldest.commit.author.date,
    lastCommit: input.newest.commit.author.date,
    commitCount: input.commitCount,
    latestRelease: input.release && !input.release.draft ? { tag: input.release.tag_name, publishedAt: input.release.published_at } : null,
  };
}

export function toContribution(item: GhSearchItem): Contribution {
  const mergedAt = item.pull_request?.merged_at;
  if (!mergedAt) throw new Error(`${item.html_url}: search returned an unmerged pull request`);
  return {
    upstream: item.repository_url.replace(`${GITHUB_API}/repos/`, ''),
    number: item.number,
    title: item.title.trim(),
    url: item.html_url,
    mergedAt,
  };
}

export function toPkgbuilds(tree: GhTree): string[] {
  if (tree.truncated) throw new Error('The PKGBUILD tree is truncated; list it per directory instead.');
  return tree.tree
    .filter(entry => entry.type === 'blob' && /^[^/]+\/PKGBUILD$/.test(entry.path))
    .map(entry => entry.path.split('/')[0]!)
    .sort();
}

/** deadhead-style rule catalogues: one Markdown file per rule, one folder deep under content/rules. */
export function toRuleFiles(tree: GhTree): { path: string; sha: string }[] {
  if (tree.truncated) throw new Error('The rule tree is truncated; list content/rules per directory instead.');
  return tree.tree
    .filter(entry => entry.type === 'blob' && entry.sha && /^content\/rules\/[^/]+\/[^/]+\.md$/.test(entry.path))
    .map(entry => ({ path: entry.path, sha: entry.sha! }));
}

const ruleScopes = new Set(['head', 'body', 'any']);

/** Every rule, and those whose frontmatter `scope` is `head` (the others are `body` or `any`). */
export function toRuleCounts(files: readonly string[]): { total: number; head: number } {
  let head = 0;
  for (const text of files) {
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    const scope = front?.match(/^scope:\s*"?([a-z]+)"?\s*$/m)?.[1];
    if (!scope) throw new Error(`a rule file has no scope in its frontmatter: ${text.slice(0, 80)}`);
    if (!ruleScopes.has(scope)) throw new Error(`a rule file has an unknown scope "${scope}": ${text.slice(0, 80)}`);
    if (scope === 'head') head++;
  }
  return { total: files.length, head };
}
