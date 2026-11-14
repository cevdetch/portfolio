import type { Contribution, PackageFacts, Snapshot, WorkFacts } from '../facts/schema.ts';
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

export interface UpstreamPull extends Contribution { highlight: boolean; note?: string; order?: number }
export interface UpstreamGroup { repo: string; url: string; pulls: UpstreamPull[]; techs: string[]; works: string[] }

export function upstreamGroups(contributions: readonly Contribution[], overrides: ContributionOverrides): UpstreamGroup[] {
  const config = new Map(overrides.upstreams.map(upstream => [upstream.repo, upstream]));
  const groups = new Map<string, UpstreamGroup>();
  for (const contribution of contributions) {
    const upstream = config.get(contribution.upstream);
    const pull = upstream?.pulls[String(contribution.number)];
    if (pull?.hidden) continue;
    const group = groups.get(contribution.upstream) ?? {
      repo: contribution.upstream, url: `https://github.com/${contribution.upstream}`,
      pulls: [], techs: upstream?.techs ?? [], works: upstream?.works ?? [],
    };
    group.pulls.push({
      ...contribution, highlight: pull?.highlight ?? false,
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
  const highlights = groups.flatMap(group => group.pulls.filter(pull => pull.highlight).map(pull => ({ group, pull })));
  return highlights.sort((a, b) => (a.pull.order ?? Number.MAX_SAFE_INTEGER) - (b.pull.order ?? Number.MAX_SAFE_INTEGER));
}

/** The counts behind "N merged pull requests to M upstream repositories", for /open-source/. */
export function contributionTotals(groups: readonly UpstreamGroup[]): { pulls: number; upstreams: number } {
  return { pulls: groups.reduce((sum, group) => sum + group.pulls.length, 0), upstreams: groups.length };
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
  icon?: string;
}

export function workFactsView(id: string, snapshot: Snapshot): WorkFactsView {
  const facts = snapshot.works[id];
  if (!facts) return { packages: [] };
  const repo = facts.repo;
  return {
    packages: facts.packages,
    ...(repo?.license ? { license: repo.license } : {}),
    ...(repo ? { active: { from: repo.firstCommit, to: repo.lastCommit }, commitCount: repo.commitCount } : {}),
    ...(repo?.latestRelease ? { release: repo.latestRelease } : {}),
    ...(facts.pkgbuilds ? { pkgbuildCount: facts.pkgbuilds.length } : {}),
    ...(facts.icon ? { icon: facts.icon.file } : {}),
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
  | { kind: 'contribution'; at: string; repo: string; label: string; number: number; title: string; url: string };

/**
 * Published package releases and merged, non-hidden, non-highlighted Contributions, newest first, for the home
 * page's "Recently shipped". Highlighted pulls already show as Contribution highlights, so they never repeat here.
 */
export function recentlyShipped(
  snapshot: Snapshot, works: readonly WorkEntry[], overrides: ContributionOverrides, limit: number,
): ShippedItem[] {
  const releases: ShippedItem[] = works.flatMap(work => {
    const facts = snapshot.works[work.id];
    if (!facts) return [];
    return facts.packages.filter(pkg => pkg.published)
      .map(pkg => ({ kind: 'release' as const, at: pkg.releasedAt, work, package: pkg.name, version: pkg.version, url: pkg.url }));
  });
  const contributions: ShippedItem[] = upstreamGroups(snapshot.contributions, overrides).flatMap(group => group.pulls
    .filter(pull => !pull.highlight)
    .map(pull => ({
      kind: 'contribution' as const, at: pull.mergedAt, repo: group.repo, label: upstreamLabel(group.repo, overrides),
      number: pull.number, title: pull.title, url: pull.url,
    })));
  return [...releases, ...contributions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
