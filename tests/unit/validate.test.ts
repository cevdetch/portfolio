import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePortfolio } from '../../src/data/validate.ts';
import { fixturePortfolio, fixtureSnapshot } from '../helpers/portfolio-fixture.ts';

test('the fixture is valid', () => {
  assert.deepEqual(validatePortfolio(fixturePortfolio(), fixtureSnapshot()), []);
});

test('an unknown Tech in a Stack fails the build', () => {
  const p = fixturePortfolio();
  p.works[0]!.data.stack.push('typescirpt');
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['work/deadhead stack: unknown Tech "typescirpt"']);
});

test('Uses, Maintains, Services, Writing and Upstream links must resolve', () => {
  const p = fixturePortfolio();
  p.uses[0]!.data.entries.push({ tech: 'zed', maintains: 'dotfiles' });
  p.profile.services[0]!.evidence.push('nope');
  p.profile.writing = 'blog';
  p.contributions.upstreams[0]!.works.push('ghost');
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()).sort(), [
    'contributions/withastro/astro: unknown Work "ghost"',
    'profile service static-sites: unknown Work "nope"',
    'profile writing: unknown Work "blog"',
    'uses/phone maintains: unknown Work "dotfiles"',
    'uses/phone: unknown Tech "zed"',
  ]);
});

test("an interest that links a Work names that Work's site in its details", () => {
  const p = fixturePortfolio();
  p.profile.interests[0]!.work = 'blog';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['profile interests[0]: unknown Work "blog"']);
  p.profile.interests[0]!.work = 'one';
  p.profile.interests[0]!.details = 'Philosophical essays';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['profile interests[0]: details must name one.cevdet.ch, the site it links']);
  p.profile.interests[0]!.work = 'deadhead';
  p.works[0]!.data.site = undefined;
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['profile interests[0]: Work "deadhead" has no site to link']);
});

test('the slug equals the repo name', () => {
  const p = fixturePortfolio();
  p.works[0]!.data.repo = 'cevdetch/dead-head';
  assert.match(validatePortfolio(p, fixtureSnapshot()).join(), /slug must equal the repo name/);
});

test('Featured needs an order, and orders run 1..n', () => {
  const p = fixturePortfolio();
  p.works[1]!.data.featured = true;
  p.works[1]!.data.order = 3;
  assert.match(validatePortfolio(p, fixtureSnapshot()).join(), /Featured order must run 1\.\.2/);
  delete p.works[1]!.data.order;
  assert.match(validatePortfolio(p, fixtureSnapshot()).join(), /featured and order go together/);
});

test('every Case study has the five sections in order', () => {
  const p = fixturePortfolio();
  p.works[0]!.body = '## Problem\n\n## Results\n';
  assert.match(validatePortfolio(p, fixtureSnapshot()).join(), /Case study sections must be Problem, Constraints, Decisions, Results, Next; found Problem, Results/);
});

test('a Work with sources needs Facts, and Facts need a Work', () => {
  const facts = fixtureSnapshot();
  delete facts.works['deadhead'];
  facts.works['ghost'] = { packages: [] };
  assert.deepEqual(validatePortfolio(fixturePortfolio(), facts).sort(), [
    'snapshot: Facts for unknown Work "ghost"; run pnpm fetch-facts',
    'work/deadhead: no Facts in the Snapshot; run pnpm fetch-facts',
  ]);
});

test('overrides must point at Contributions in the Snapshot', () => {
  const p = fixturePortfolio();
  p.contributions.upstreams[0]!.pulls['999'] = { hidden: true, highlight: false };
  p.contributions.upstreams.push({ repo: 'nope/nope', techs: [], works: [], pulls: {} });
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()).sort(), [
    'contributions/nope/nope: no merged Contribution in the Snapshot',
    'contributions/withastro/astro#999: not in the Snapshot',
  ]);
});

test('CV-shared Story is linted', () => {
  const p = fixturePortfolio();
  p.works[0]!.data.highlights = ['I wrote 203 rules for v0.3.1'];
  const errors = validatePortfolio(p, fixtureSnapshot()).join('\n');
  assert.match(errors, /work\/deadhead highlights\[0\]: a version is a Fact/);
  assert.match(errors, /work\/deadhead highlights\[0\]: CV-shared Story is verb-led and pronoun-free/);
});

test('a cvLine is CV-shared Story and its tokens must resolve', () => {
  const p = fixturePortfolio();
  p.works[0]!.data.cvLine = 'My linter, {pkgbuilds} rules, {stars} stars.';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'work/deadhead cvLine: CV-shared Story is verb-led and pronoun-free',
    'work/deadhead cvLine: {pkgbuilds} has no Fact in the Snapshot',
    'work/deadhead cvLine: unknown token {stars}',
  ]);
});

test('services, Uses notes, Metric labels and interests are linted too', () => {
  const p = fixturePortfolio();
  p.profile.services[0]!.name = 'Sites (coming soon)';
  p.profile.services[0]!.summary = 'Astro 7.4.2 sites.';
  p.uses[0]!.data.entries[0]!.note = 'TODO: describe';
  p.works[0]!.data.metrics = [{ label: 'Rules in v0.3.1', value: '203', measuredAt: '2026-11-01', source: { label: 'README' } }];
  p.profile.interests = [{ label: 'Pursuits', details: 'My bouldering and hiking', cv: false }];
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'work/deadhead metrics[0] label: a version is a Fact; remove it from Story',
    'uses/phone entries[0] note: placeholder text',
    'profile service static-sites name: placeholder text',
    'profile service static-sites summary: a version is a Fact; remove it from Story',
    'profile interests[0] details: CV-shared Story is verb-led and pronoun-free',
  ]);
  p.profile.services[0]!.summary = 'My Astro sites.';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()).filter(error => error.includes('summary')), []);
});
