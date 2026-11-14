import { publicRepo, type Contribution, type PackageFacts, type Snapshot, type WorkFacts } from '../facts/schema.ts';
import type { ContributionOverrides } from '../schemas/contributions.ts';
import type { Profile } from '../schemas/profile.ts';
import { techCategories, type Tech, type TechCategory } from '../schemas/tech.ts';
import type { UsesSection } from '../schemas/uses.ts';
import type { Metric } from '../schemas/work.ts';
import type { WorkEntry } from './validate.ts';

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Splits text on the whole-word occurrences of any title, for linking Work names that appear in prose. */
export function splitOnTitles(text: string, titles: readonly string[]): string[] {
  if (titles.length === 0) return [text];
  return text.split(new RegExp(`\\b(${titles.map(escapeRegExp).join('|')})\\b`));
}

/** Entries in the order of their ids in the source file; `getCollection` returns them sorted by id. */
export function inSourceOrder<T extends { id: string }>(entries: readonly T[], ids: readonly string[]): T[] {
  const index = new Map(ids.map((id, position) => [id, position]));
  const rank = (entry: T) => index.get(entry.id) ?? Number.MAX_SAFE_INTEGER;
  return [...entries].sort((a, b) => rank(a) - rank(b));
}

/** Experience and Education, most recent start first. */
export function newestFirst<T extends { start: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.start.localeCompare(a.start));
}

export function orderWorks(works: readonly WorkEntry[]): WorkEntry[] {
  const rank = (work: WorkEntry) => work.data.featured && work.data.order !== undefined ? work.data.order : Number.MAX_SAFE_INTEGER;
  return [...works].sort((a, b) => rank(a) - rank(b) || a.data.title.localeCompare(b.data.title));
}

export function featuredWorks(works: readonly WorkEntry[]): WorkEntry[] {
  return orderWorks(works.filter(work => work.data.featured));
}

export interface SkillGroup { category: TechCategory; label: string; techs: { tech: Tech; works: WorkEntry[] }[] }

export function skillGroups(techs: readonly Tech[], works: readonly WorkEntry[]): SkillGroup[] {
  return (Object.keys(techCategories) as TechCategory[])
    .filter(category => techCategories[category].skills)
    .map(category => ({
      category,
      label: techCategories[category].label,
      techs: techs.filter(tech => tech.category === category)
        .map(tech => ({ tech, works: orderWorks(works.filter(work => work.data.stack.includes(tech.id))) })),
    }))
    .filter(group => group.techs.length > 0);
}

export interface UpstreamPull extends Contribution { hidden: boolean; highlight: boolean; note?: string; order?: number }
export interface UpstreamGroup { repo: string; url: string; pulls: UpstreamPull[]; techs: string[]; works: string[] }

/** Every merged pull, grouped by Upstream; a hidden pull stays listed, flagged, so only the home page drops it. */
export function upstreamGroups(contributions: readonly Contribution[], overrides: ContributionOverrides): UpstreamGroup[] {
  const config = new Map(overrides.upstreams.map(upstream => [upstream.repo, upstream]));
  const groups = new Map<string, UpstreamGroup>();
  for (const contribution of contributions) {
    const upstream = config.get(contribution.upstream);
    const pull = upstream?.pulls[String(contribution.number)];
    const group = groups.get(contribution.upstream) ?? {
      repo: contribution.upstream, url: `https://github.com/${contribution.upstream}`,
      pulls: [], techs: upstream?.techs ?? [], works: upstream?.works ?? [],
    };
    group.pulls.push({
      ...contribution, hidden: pull?.hidden ?? false, highlight: pull?.highlight ?? false,
      ...(pull?.note ? { note: pull.note } : {}), ...(pull?.order !== undefined ? { order: pull.order } : {}),
    });
    groups.set(contribution.upstream, group);
  }
  const rank = (group: UpstreamGroup) => config.get(group.repo)?.order ?? Number.MAX_SAFE_INTEGER;
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.pulls.length - a.pulls.length || a.repo.localeCompare(b.repo));
}

export interface ContributionHighlight { group: UpstreamGroup; pull: UpstreamPull }

/** The highlighted pulls across every Upstream, in their pinned order, never the Upstream group's own order. */
export function contributionHighlights(groups: readonly UpstreamGroup[]): ContributionHighlight[] {
  const highlights = groups.flatMap(group => group.pulls.filter(pull => pull.highlight && !pull.hidden).map(pull => ({ group, pull })));
  return highlights.sort((a, b) => (a.pull.order ?? Number.MAX_SAFE_INTEGER) - (b.pull.order ?? Number.MAX_SAFE_INTEGER));
}

const discussionFloor = 3;

/** A Contribution highlight's quiet review signal, "13 comments in review", from three comments up. */
export function discussionLine(discussion: Contribution['discussion']): string | undefined {
  return discussion && discussion.comments >= discussionFloor ? `${discussion.comments} comments in review` : undefined;
}

/** The counts behind "N merged pull requests to M upstream repositories", for /open-source/. */
export function contributionTotals(groups: readonly UpstreamGroup[]): { pulls: number; upstreams: number } {
  return { pulls: groups.reduce((sum, group) => sum + group.pulls.length, 0), upstreams: groups.length };
}

export interface ContributionSpan { from: string; to: string; ongoing: boolean }

const ongoingDays = 90;

/**
 * The first and last merge among the non-hidden Contributions, for the CV's Open Source heading; /open-source/ passes
 * `includeHidden` so its sentence covers exactly the pulls it lists and counts.
 * Ongoing ("present") while the last merge is under 90 days older than `now`, the Snapshot's refresh time, so the
 * offline build stays deterministic. Limitation: refreshedAt moves only when some Fact changes, so after a quiet
 * stretch "present" can outlast the 90 days. A separate checkedAt bumped on every run would fix that, but the weekly
 * refresh would then commit a Snapshot change every week with no Fact behind it; any new merge, commit or release
 * moves refreshedAt anyway.
 */
export function contributionSpan(
  contributions: readonly Contribution[], overrides: ContributionOverrides, now: string, includeHidden = false,
): ContributionSpan | undefined {
  const dates = upstreamGroups(contributions, overrides)
    .flatMap(group => group.pulls.filter(pull => includeHidden || !pull.hidden).map(pull => pull.mergedAt)).sort();
  const from = dates[0];
  const to = dates.at(-1);
  if (!from || !to) return undefined;
  return { from, to, ongoing: Date.parse(now) - Date.parse(to) < ongoingDays * 86_400_000 };
}

/** The Handle's merged pull requests to one Upstream, on GitHub. */
export function mergedPullsUrl(repo: string, handle: string): string {
  return `https://github.com/${repo}/pulls?q=${encodeURIComponent(`is:pr is:merged author:${handle}`).replaceAll('%20', '+')}`;
}

export interface WorkFactsView {
  packages: PackageFacts[];
  license?: string;
  active?: { from: string; to: string };
  commitCount?: number;
  release?: { tag: string; publishedAt: string };
  pkgbuildCount?: number;
  rules?: { total: number; head: number };
  icon?: string;
  // The one rule for linking a repository: the Story names it and the Snapshot found it public.
  repoUrl?: string;
  // The Snapshot found the Work's repository private: the page says so where the repository link would be.
  sourcePrivate?: true;
}

export function workFactsView(id: string, snapshot: Snapshot, repoName?: string): WorkFactsView {
  const facts = snapshot.works[id];
  if (!facts) return { packages: [] };
  const repo = publicRepo(facts);
  return {
    packages: facts.packages,
    ...(repo?.license ? { license: repo.license } : {}),
    ...(repo ? { active: { from: repo.firstCommit, to: repo.lastCommit }, commitCount: repo.commitCount } : {}),
    ...(repo?.latestRelease ? { release: repo.latestRelease } : {}),
    ...(facts.pkgbuilds ? { pkgbuildCount: facts.pkgbuilds.length } : {}),
    ...(facts.rules ? { rules: facts.rules } : {}),
    ...(facts.icon ? { icon: facts.icon.file } : {}),
    ...(repoName && repo ? { repoUrl: `https://github.com/${repoName}` } : {}),
    ...(facts.repo?.private ? { sourcePrivate: true as const } : {}),
  };
}

// Tokens a cvLine may hold, each filled from the Work's Facts.
const cvLineTokens = new Map<string, (facts: WorkFacts | undefined) => number | undefined>([
  ['pkgbuilds', facts => facts?.pkgbuilds?.length],
]);
const count = new Intl.NumberFormat('en');

/** Replaces each `{token}` in a cvLine with its Fact; `problems` lists what could not be filled. */
export function fillCvLine(text: string, facts: WorkFacts | undefined): { text: string; problems: string[] } {
  const problems: string[] = [];
  const filled = text.replace(/\{(\w+)\}/g, (token, name: string) => {
    const fill = cvLineTokens.get(name);
    if (!fill) { problems.push(`unknown token ${token}`); return token; }
    const value = fill(facts);
    if (value === undefined) { problems.push(`${token} has no Fact in the Snapshot`); return token; }
    return count.format(value);
  });
  return { text: filled, problems };
}

export function usesSections<T extends { id: string; data: UsesSection }>(uses: readonly T[]): T[] {
  return [...uses].sort((a, b) => a.data.order - b.data.order);
}

/** Per Service, the evidence Works no earlier Service cited: /hire/ shows a Work's caveat at its first citation only. */
export function firstCitations(services: readonly { evidence: readonly string[] }[]): string[][] {
  const cited = new Set<string>();
  return services.map(service => service.evidence.filter(id => !cited.has(id) && cited.add(id)));
}

export interface HomeMetric { work: WorkEntry; metric: Metric }

/** The home page's numbers strip, resolved from profile.homeMetrics; validatePortfolio guarantees every pin resolves. */
export function homeMetrics(pins: Profile['homeMetrics'], works: readonly WorkEntry[]): HomeMetric[] {
  return pins.map(pin => {
    const work = works.find(entry => entry.id === pin.work)!;
    const metric = work.data.metrics.find(entry => entry.label === pin.label)!;
    return { work, metric };
  });
}

export interface MetricDisplay { value: string; label: string }

/** The numbers strip prefers a Metric's short headline; falls back to its full value and label when it has none. */
export function metricDisplay(metric: Metric): MetricDisplay {
  return metric.headline ? { value: metric.headline.value, label: metric.headline.label } : { value: metric.value, label: metric.label };
}

/** An Upstream's display name, from its base `overrides.upstreams` entry; falls back to the repo id when unset. */
export function upstreamLabel(repo: string, overrides: ContributionOverrides): string {
  return overrides.upstreams.find(upstream => upstream.repo === repo)?.label ?? repo;
}

export type ShippedItem =
  | { kind: 'release'; at: string; work: WorkEntry; package: string; version: string; url: string }
  | { kind: 'contribution'; at: string; repo: string; label: string; number: number; title: string; url: string }
  | { kind: 'pulls'; at: string; from: string; repo: string; label: string; count: number; url: string };

const burstDays = 7;

/** Orders dotted release versions numerically, so 0.10.0 sorts above 0.9.0; a pre-release tag sorts below its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => {
    const [core = '', pre] = version.replace(/^v/, '').split('-', 2);
    return { parts: core.split('.').map(Number), pre };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.parts.length, right.parts.length); i++) {
    const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0);
    if (diff) return diff;
  }
  if (left.pre === right.pre) return 0;
  if (left.pre === undefined) return 1;
  if (right.pre === undefined) return -1;
  return left.pre.localeCompare(right.pre);
}

/**
 * Published package releases and merged, non-hidden, non-highlighted Contributions, newest first, for the home
 * page's "Recently shipped". Highlighted pulls already show as Contribution highlights, so they never repeat here.
 * One Work's releases on the same UTC day, such as a CLI and its plugin, show as one line: the higher version, or
 * the newer release when the versions tie. Pulls to one Upstream merged within 7 days of each other show as one
 * line too, dated by the newest merge and linked to the Handle's merged pulls there, so one burst of fixes cannot
 * fill the list.
 */
export function recentlyShipped(
  snapshot: Snapshot, works: readonly WorkEntry[], overrides: ContributionOverrides, limit: number, handle: string,
): ShippedItem[] {
  const releases: ShippedItem[] = works.flatMap(work => {
    const facts = snapshot.works[work.id];
    if (!facts) return [];
    const byDay = new Map<string, ShippedItem & { kind: 'release' }>();
    for (const pkg of facts.packages) {
      if (!pkg.published) continue;
      const item = { kind: 'release' as const, at: pkg.releasedAt, work, package: pkg.name, version: pkg.version, url: pkg.url };
      const day = item.at.slice(0, 10);
      const kept = byDay.get(day);
      const order = kept ? compareVersions(item.version, kept.version) || item.at.localeCompare(kept.at) : 1;
      if (order > 0) byDay.set(day, item);
    }
    return [...byDay.values()];
  });
  const contributions: ShippedItem[] = upstreamGroups(snapshot.contributions, overrides).flatMap(group => {
    const label = upstreamLabel(group.repo, overrides);
    const pulls = group.pulls.filter(pull => !pull.highlight && !pull.hidden).sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
    // Newest first, a pull joins the current burst when it was merged within 7 days of the burst's oldest merge so far.
    const bursts: UpstreamPull[][] = [];
    for (const pull of pulls) {
      const burst = bursts.at(-1);
      const oldest = burst?.at(-1);
      if (burst && oldest && Date.parse(oldest.mergedAt) - Date.parse(pull.mergedAt) <= burstDays * 86_400_000) burst.push(pull);
      else bursts.push([pull]);
    }
    return bursts.map((burst): ShippedItem => {
      const [newest] = burst as [UpstreamPull];
      if (burst.length === 1) {
        return { kind: 'contribution', at: newest.mergedAt, repo: group.repo, label, number: newest.number, title: newest.title, url: newest.url };
      }
      return {
        kind: 'pulls', at: newest.mergedAt, from: burst.at(-1)!.mergedAt, repo: group.repo, label, count: burst.length,
        url: mergedPullsUrl(group.repo, handle),
      };
    });
  });
  return [...releases, ...contributions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
