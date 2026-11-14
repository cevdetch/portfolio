import type { Snapshot } from './schema.ts';

type Payload = Pick<Snapshot, 'works' | 'contributions'>;

/** Sorted keys, two-space indent, trailing newline: one stable file, one reviewable diff. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item, 2)}\n`;
}

function normalise(payload: Payload): Payload {
  return {
    works: Object.fromEntries(Object.entries(payload.works).sort(([a], [b]) => a.localeCompare(b)).map(([id, facts]) => [id, {
      ...facts,
      packages: [...facts.packages].sort((a, b) => `${a.registry}:${a.name}`.localeCompare(`${b.registry}:${b.name}`)),
    }])),
    contributions: [...payload.contributions].sort((a, b) => b.mergedAt.localeCompare(a.mergedAt)
      || a.upstream.localeCompare(b.upstream) || a.number - b.number),
  };
}

export function mergeSnapshot(previous: Snapshot | undefined, next: Payload, now: Date): { snapshot: Snapshot; changed: boolean } {
  const payload = normalise(next);
  const changed = !previous || stableJson(normalise(previous)) !== stableJson(payload);
  const refreshedAt = changed || !previous ? now.toISOString() : previous.refreshedAt;
  return { changed, snapshot: { version: 1, refreshedAt, ...payload } };
}

export function describeChanges(previous: Snapshot | undefined, next: Snapshot): string[] {
  if (!previous) return ['first Snapshot'];
  const lines: string[] = [];
  const ids = [...new Set([...Object.keys(previous.works), ...Object.keys(next.works)])].sort();
  for (const id of ids) {
    const before = previous.works[id];
    const after = next.works[id];
    if (!before) { lines.push(`${id}: Facts added`); continue; }
    if (!after) { lines.push(`${id}: Facts removed`); continue; }
    const emitted = lines.length;
    for (const pkg of after.packages) {
      const old = before.packages.find(item => item.registry === pkg.registry && item.name === pkg.name);
      const from = old?.published ? old.version : 'unpublished';
      const to = pkg.published ? pkg.version : 'unpublished';
      if (from !== to) lines.push(`${id}: ${pkg.registry} ${pkg.name} ${from} → ${to}`);
    }
    if (before.repo?.license !== after.repo?.license) lines.push(`${id}: licence ${before.repo?.license ?? 'none'} → ${after.repo?.license ?? 'none'}`);
    if (before.repo?.latestRelease?.tag !== after.repo?.latestRelease?.tag) {
      lines.push(`${id}: release ${before.repo?.latestRelease?.tag ?? 'none'} → ${after.repo?.latestRelease?.tag ?? 'none'}`);
    }
    if (before.repo?.commitCount !== after.repo?.commitCount) lines.push(`${id}: ${before.repo?.commitCount ?? 0} → ${after.repo?.commitCount ?? 0} commits`);
    if (before.pkgbuilds?.join() !== after.pkgbuilds?.join()) lines.push(`${id}: ${before.pkgbuilds?.length ?? 0} → ${after.pkgbuilds?.length ?? 0} PKGBUILDs`);
    if (before.icon?.sha256 !== after.icon?.sha256) lines.push(`${id}: icon ${after.icon ? 'changed' : 'removed'}`);
    // A change with no line of its own (lastCommit, a release date) still gets one.
    if (lines.length === emitted && stableJson(before) !== stableJson(after)) lines.push(`${id}: Facts updated`);
  }
  const workLines = lines.length;
  const had = new Set(previous.contributions.map(c => c.url));
  const has = new Set(next.contributions.map(c => c.url));
  for (const c of next.contributions) if (!had.has(c.url)) lines.push(`contribution: ${c.upstream}#${c.number} merged`);
  for (const c of previous.contributions) if (!has.has(c.url)) lines.push(`contribution: ${c.upstream}#${c.number} no longer listed`);
  const before = new Map(previous.contributions.map(c => [c.url, c.discussion?.comments ?? 0]));
  for (const c of next.contributions) {
    const from = before.get(c.url) ?? 0;
    const to = c.discussion?.comments ?? 0;
    if (from !== to) lines.push(`contribution: ${c.upstream}#${c.number} discussion ${from} → ${to} ${to === 1 ? 'comment' : 'comments'}`);
  }
  if (lines.length === workLines && stableJson(previous.contributions) !== stableJson(next.contributions)) lines.push('contributions updated');
  return lines;
}
