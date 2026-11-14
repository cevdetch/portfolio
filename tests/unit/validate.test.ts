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

test('a bio token that cannot be filled from Education fails the build', () => {
  const p = fixturePortfolio();
  p.profile.bio = 'Studies for the Matura ({graduationYear}).';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), []);
  p.profile.bio = 'Studying since {startYear}.';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['profile bio: unknown token {startYear}']);
});

test("the home page links each proofWorks entry, so its title must appear in the proof as a whole word", () => {
  const p = fixturePortfolio();
  p.profile.proofWorks = ['blog'];
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['profile proofWorks[0]: unknown Work "blog"']);
  p.profile.proofWorks = ['one'];
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['profile proofWorks[0]: proof must name "One" as a whole word']);
  p.profile.proofWorks = ['deadhead'];
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), []);
});

test('a home Metric pin must name an existing Work and one of its Metric labels', () => {
  const p = fixturePortfolio();
  p.profile.homeMetrics.push({ work: 'blog', label: 'Sourced rules' });
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['profile homeMetrics[1]: unknown Work "blog"']);
  p.profile.homeMetrics[1] = { work: 'one', label: 'Sourced rules' };
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['profile homeMetrics[1]: Work "one" has no Metric "Sourced rules"']);
  p.profile.homeMetrics[1] = { work: 'deadhead', label: 'Sourced rules' };
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), []);
});

test('cv projects and skills reference Works and Techs that exist', () => {
  const p = fixturePortfolio();
  p.cv.projects.push({ works: ['ghost'], optional: false });
  p.cv.skills[0]!.items.push({ techs: ['cobol'] });
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'cv projects[3]: unknown Work "ghost"',
    'cv skills[0] items[1]: unknown Tech "cobol"',
  ]);
});

test('a cv entry without a title prints one Work; a titled one prints a cvLine per Work', () => {
  const p = fixturePortfolio();
  p.cv.projects[0]!.works.push('one');
  p.cv.projects[1]!.works.push('one');
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'cv projects[0]: an entry without a title holds exactly one Work',
    'cv projects[1]: Work "one" has no cvLine to print',
    'cv projects[1]: Work "one" appears in more than one entry',
  ]);
});

test('a cv skill item with several Techs needs a display label, and each Tech appears once', () => {
  const p = fixturePortfolio();
  delete p.cv.skills[1]!.items[0]!.display;
  p.cv.skills[0]!.items.push({ techs: ['typescript'] });
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'cv skills[0] items[1]: Tech "typescript" appears more than once',
    'cv skills[1] items[0]: several Techs need a display label',
  ]);
});

test('cv titles and labels are CV-shared Story', () => {
  const p = fixturePortfolio();
  p.cv.projects[1]!.title = 'My templates';
  p.cv.skills[0]!.label = 'TODO';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'cv projects[1] title: Story is verb-led and pronoun-free',
    'cv skills[0] label: placeholder text',
  ]);
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

test('every theme Upstream has merged Contributions, and theme ids are unique', () => {
  const p = fixturePortfolio();
  p.contributions.themes[0]!.upstreams.push('nope/nope');
  p.contributions.themes.push({ ...p.contributions.themes[0]!, upstreams: ['sveltejs/svelte'] });
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()).sort(), [
    'contributions theme head-metadata: duplicate id',
    'contributions theme head-metadata: no merged Contribution to nope/nope in the Snapshot',
    'contributions theme head-metadata: nope/nope has no label in the base Upstreams',
    'contributions theme head-metadata: sveltejs/svelte already appears in theme head-metadata',
  ]);
});

test('a theme Upstream must carry a label in the base Upstreams, even when merged', () => {
  const p = fixturePortfolio();
  delete p.contributions.upstreams.find(upstream => upstream.repo === 'sveltejs/svelte')!.label;
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()).sort(), [
    'contributions theme head-metadata: sveltejs/svelte has no label in the base Upstreams',
    'contributions/sveltejs/svelte: a merged pull has no label in the base Upstreams',
  ].sort());
});

test('any merged Upstream needs a base label, even outside every theme', () => {
  const facts = fixtureSnapshot();
  facts.contributions.push({ upstream: 'test/merged', number: 1, title: 'A fix', url: 'https://github.com/test/merged/pull/1', mergedAt: '2026-01-01T00:00:00Z' });
  assert.deepEqual(validatePortfolio(fixturePortfolio(), facts), [
    'contributions/test/merged: a merged pull has no label in the base Upstreams',
  ]);
});

test('a hidden pull does not need a base label', () => {
  const facts = fixtureSnapshot();
  facts.contributions.push({ upstream: 'test/merged', number: 1, title: 'A fix', url: 'https://github.com/test/merged/pull/1', mergedAt: '2026-01-01T00:00:00Z' });
  const p = fixturePortfolio();
  p.contributions.upstreams.push({ repo: 'test/merged', techs: [], works: [], pulls: { '1': { hidden: true, highlight: false } } });
  assert.deepEqual(validatePortfolio(p, facts), []);
});

test('a repo cannot appear twice within one theme', () => {
  const p = fixturePortfolio();
  p.contributions.themes[0]!.upstreams.push('withastro/astro');
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'contributions theme head-metadata: withastro/astro appears twice',
  ]);
});

test('a repo cannot appear in two different themes', () => {
  const p = fixturePortfolio();
  p.contributions.themes.push({ id: 'second-theme', lead: 'More fixes merged into', upstreams: ['withastro/astro'] });
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'contributions theme second-theme: withastro/astro already appears in theme head-metadata',
  ]);
});

test('theme leads and notes are CV-shared Story', () => {
  const p = fixturePortfolio();
  p.contributions.themes[0]!.lead = 'Our fixes merged into';
  p.contributions.themes[0]!.note = 'including a fix in Astro 7.4.2';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'contributions theme head-metadata lead: Story is verb-led and pronoun-free',
    'contributions theme head-metadata note: a version is a Fact; remove it from Story',
  ]);
});

test('CV-shared Story is linted', () => {
  const p = fixturePortfolio();
  p.works[0]!.data.highlights = ['I wrote 203 rules for v0.3.1'];
  const errors = validatePortfolio(p, fixtureSnapshot()).join('\n');
  assert.match(errors, /work\/deadhead highlights\[0\]: a version is a Fact/);
  assert.match(errors, /work\/deadhead highlights\[0\]: Story is verb-led and pronoun-free/);
});

test('a caveat is Story shown beside the Work wherever it is cited, so it is pronoun-free', () => {
  const p = fixturePortfolio();
  p.works[0]!.data.caveat = 'I left it unstyled on purpose.';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), ['work/deadhead caveat: Story is verb-led and pronoun-free']);
});

test('a cvLine is CV-shared Story and its tokens must resolve', () => {
  const p = fixturePortfolio();
  p.works[0]!.data.cvLine = 'My linter, {pkgbuilds} rules, {stars} stars.';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'work/deadhead cvLine: Story is verb-led and pronoun-free',
    'work/deadhead cvLine: {pkgbuilds} has no Fact in the Snapshot',
    'work/deadhead cvLine: unknown token {stars}',
  ]);
});

test('the about story is Story, so it is linted and pronoun-free', () => {
  const p = fixturePortfolio();
  p.profile.about = ['Started with the HTML head.', 'My second paragraph, todo.'];
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'profile about[1]: placeholder text',
    'profile about[1]: Story is verb-led and pronoun-free',
  ]);
});

test('process steps are linted', () => {
  const p = fixturePortfolio();
  p.profile.process[0]!.title = 'My reply';
  p.profile.process[1]!.detail = 'Scope the work in v0.3.1.';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'profile process[0] title: Story is verb-led and pronoun-free',
    'profile process[1] detail: a version is a Fact; remove it from Story',
  ]);
});

test('services, Uses notes, Metric labels and interests are linted too', () => {
  const p = fixturePortfolio();
  p.profile.services[0]!.name = 'Sites (coming soon)';
  p.profile.services[0]!.summary = 'Astro 7.4.2 sites.';
  p.uses[0]!.data.entries[0]!.note = 'TODO: describe';
  p.works[0]!.data.metrics.push({ label: 'Rules in v0.3.1', value: '203', measuredAt: '2026-11-01', source: { label: 'README' } });
  p.profile.interests = [{ label: 'Pursuits', details: 'My bouldering and hiking', cv: false }];
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'work/deadhead metrics[1] label: a version is a Fact; remove it from Story',
    'uses/phone entries[0] note: placeholder text',
    'profile service static-sites name: placeholder text',
    'profile service static-sites summary: a version is a Fact; remove it from Story',
    'profile interests[0] details: Story is verb-led and pronoun-free',
  ]);
  p.profile.services[0]!.summary = 'My Astro sites.';
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()).filter(error => error.includes('summary')), []);
});

test("a Metric headline's label is linted too, alongside its full label", () => {
  const p = fixturePortfolio();
  p.works[0]!.data.metrics[0]!.headline = { value: '203', label: 'TODO headline' };
  assert.deepEqual(validatePortfolio(p, fixtureSnapshot()), [
    'work/deadhead metrics[0] headline label: placeholder text',
  ]);
});
