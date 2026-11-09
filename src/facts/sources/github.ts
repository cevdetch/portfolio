import type { Contribution, RepoFacts } from '../schema.ts';

export const GITHUB_API = 'https://api.github.com';
// Contributions: merged, authored by cevdetch, in public repositories cevdetch does not own.
export const contributionsQuery = 'is:pr is:merged is:public author:cevdetch -user:cevdetch';

export interface GhRepo { private: boolean; default_branch: string; license: { spdx_id: string } | null }
export interface GhCommit { commit: { author: { date: string } } }
export interface GhRelease { tag_name: string; published_at: string; draft: boolean }
export interface GhSearchItem { html_url: string; number: number; title: string; repository_url: string; pull_request?: { merged_at: string | null } }
export interface GhSearch { total_count: number; items: GhSearchItem[] }
export interface GhTree { truncated: boolean; tree: { path: string; type: 'blob' | 'tree' | 'commit' }[] }

export function lastPage(link: string | null): number | null {
  const last = link?.split(',').find(part => /rel="last"/.test(part));
  const url = last?.match(/<([^>]+)>/)?.[1];
  const page = url ? new URL(url).searchParams.get('page') : null;
  return page ? Number(page) : null;
}

export function toRepoFacts(input: { repo: GhRepo; newest: GhCommit; oldest: GhCommit; commitCount: number; release: GhRelease | null }): RepoFacts {
  const spdx = input.repo.license?.spdx_id;
  return {
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
