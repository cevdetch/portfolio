import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicRepo } from '../../src/facts/schema.ts';
import { describeChanges, mergeSnapshot, stableJson } from '../../src/facts/snapshot.ts';
import { fixtureSnapshot } from '../helpers/portfolio-fixture.ts';

const later = new Date('2026-11-16T06:00:00.000Z');

test('stableJson sorts keys so parse order never creates a diff', () => {
  assert.equal(stableJson({ b: 1, a: { d: 2, c: 3 } }), '{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
});

test('unchanged Facts keep refreshedAt, so the weekly run commits nothing', () => {
  const previous = fixtureSnapshot();
  const reordered = { works: Object.fromEntries(Object.entries(previous.works).reverse()), contributions: [...previous.contributions].reverse() };
  const { snapshot, changed } = mergeSnapshot(previous, reordered, later);
  assert.equal(changed, false);
  assert.equal(snapshot.refreshedAt, previous.refreshedAt);
});

test('a changed Fact bumps refreshedAt and sorts Contributions newest first', () => {
  const previous = fixtureSnapshot();
  const next = structuredClone({ works: previous.works, contributions: previous.contributions });
  next.works['deadhead']!.packages = [{ registry: 'npm', name: 'deadhead', published: true, version: '0.4.0', releasedAt: '2026-11-15T10:00:00.000Z', url: 'https://www.npmjs.com/package/deadhead' }];
  const { snapshot, changed } = mergeSnapshot(previous, next, later);
  assert.equal(changed, true);
  assert.equal(snapshot.refreshedAt, later.toISOString());
  assert.deepEqual(snapshot.contributions.map(c => c.number), [102, 7, 101]);
});

test('describeChanges writes a reviewable line per Fact change', () => {
  const previous = fixtureSnapshot();
  const next = structuredClone(previous);
  next.works['deadhead']!.packages = [{ registry: 'npm', name: 'deadhead', published: true, version: '0.4.0', releasedAt: '2026-11-15T10:00:00.000Z', url: 'https://www.npmjs.com/package/deadhead' }];
  publicRepo(next.works['deadhead'])!.commitCount = 420;
  next.works['one']!.icon = { file: 'icons/one.svg', sha256: 'b'.repeat(64) };
  next.contributions.unshift({ upstream: 'immich-app/immich', number: 5, title: 'Fix', url: 'https://github.com/immich-app/immich/pull/5', mergedAt: '2026-11-10T00:00:00Z' });
  assert.deepEqual(describeChanges(previous, next), [
    'deadhead: npm deadhead 0.3.1 → 0.4.0',
    'deadhead: 412 → 420 commits',
    'one: icon changed',
    'contribution: immich-app/immich#5 merged',
  ]);
  assert.deepEqual(describeChanges(undefined, next), ['first Snapshot']);
});

test('describeChanges names a change in the rule counts', () => {
  const previous = fixtureSnapshot();
  previous.works['deadhead']!.rules = { total: 203, head: 92 };
  const next = structuredClone(previous);
  next.works['deadhead']!.rules = { total: 204, head: 93 };
  assert.deepEqual(describeChanges(previous, next), ['deadhead: 203 → 204 rules, 92 → 93 for the head']);
});

test('describeChanges names a repository that turned public or private', () => {
  const previous = fixtureSnapshot();
  const next = structuredClone(previous);
  next.works['homelab']!.repo = { ...previous.works['astro-minimal-template']!.repo! };
  next.works['astro-minimal-template']!.repo = { private: true };
  assert.deepEqual(describeChanges(previous, next), [
    'astro-minimal-template: source public → private',
    'homelab: source private → public',
  ]);
});

test('describeChanges names a change in a highlighted pull\'s review discussion', () => {
  const previous = fixtureSnapshot();
  const next = structuredClone(previous);
  next.contributions[2]!.discussion = { comments: 5 };
  assert.deepEqual(describeChanges(previous, next), ['contribution: withastro/astro#101 discussion 0 → 5 comments']);
  next.contributions[2]!.discussion = { comments: 1 };
  assert.deepEqual(describeChanges(previous, next), ['contribution: withastro/astro#101 discussion 0 → 1 comment']);
});

test('describeChanges still names a Work or the contributions when only an unlisted Fact moved', () => {
  const previous = fixtureSnapshot();
  const next = structuredClone(previous);
  publicRepo(next.works['deadhead'])!.lastCommit = '2026-11-12T10:00:00Z';
  next.works['deadhead']!.packages = [{ registry: 'npm', name: 'deadhead', published: true, version: '0.3.1', releasedAt: '2026-10-21T10:00:00.000Z', url: 'https://www.npmjs.com/package/deadhead' }];
  next.contributions[0]!.title = 'Handle the base path in the sitemap';
  assert.deepEqual(describeChanges(previous, next), ['deadhead: Facts updated', 'contributions updated']);
  publicRepo(next.works['deadhead'])!.commitCount = 413;
  assert.deepEqual(describeChanges(previous, next), ['deadhead: 412 → 413 commits', 'contributions updated']);
  assert.deepEqual(describeChanges(previous, structuredClone(previous)), []);
});
