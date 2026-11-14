import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availabilityLine, fillBio, languageItem, socialUsername } from '../../src/data/profile.ts';
import { contributionHighlights, contributionTotals, featuredWorks, fillCvLine, homeMetrics, inSourceOrder, mergedPullsUrl, metricDisplay, newestFirst, recentlyShipped, skillGroups, splitOnTitles, upstreamGroups, upstreamLabel, workFactsView } from '../../src/data/views.ts';
import { formatDay, formatMonth, joinList } from '../../src/lib/format.ts';
import { fixturePortfolio, fixtureSnapshot } from '../helpers/portfolio-fixture.ts';

test('skills group by category in registry order, without apps, with evidence', () => {
  const p = fixturePortfolio();
  const groups = skillGroups(p.techs, p.works);
  assert.deepEqual(groups.map(g => g.category), ['language', 'framework', 'desktop']);
  assert.deepEqual(groups[0]!.techs.map(t => [t.tech.id, t.works.map(w => w.id)]), [['typescript', ['deadhead']]]);
  assert.deepEqual(groups[2]!.techs[0]!.works, []);
});

test('collection entries return to the order of the source file', () => {
  const sortedById = [{ id: 'bash' }, { id: 'css' }, { id: 'typescript' }];
  assert.deepEqual(inSourceOrder(sortedById, ['typescript', 'css', 'bash']).map(entry => entry.id), ['typescript', 'css', 'bash']);
  assert.deepEqual(inSourceOrder(sortedById, ['css']).map(entry => entry.id), ['css', 'bash', 'typescript']);
});

test('experience and education run newest start first', () => {
  const entries = [{ id: 'a', start: '2019-09' }, { id: 'b', start: '2024-08' }, { id: 'c', start: '2022-03' }];
  assert.deepEqual(newestFirst(entries).map(entry => entry.id), ['b', 'c', 'a']);
  assert.deepEqual(entries.map(entry => entry.id), ['a', 'b', 'c']);
});

test('splitting on titles keeps the text whole when there is nothing to split on', () => {
  assert.deepEqual(splitOnTitles('Creator of deadhead.', []), ['Creator of deadhead.']);
  assert.deepEqual(splitOnTitles('Creator of deadhead.', ['favseed']), ['Creator of deadhead.']);
});

test('splitting on titles alternates text and titles', () => {
  assert.deepEqual(splitOnTitles('Creator of deadhead and favseed.', ['deadhead', 'favseed']), ['Creator of ', 'deadhead', ' and ', 'favseed', '.']);
});

test('punctuation next to a title still splits on it', () => {
  assert.deepEqual(splitOnTitles('(deadhead), favseed.', ['deadhead', 'favseed']), ['(', 'deadhead', '), ', 'favseed', '.']);
});

test('regex characters in a title match only themselves', () => {
  assert.deepEqual(splitOnTitles('Runs on Node.js, not NodeXjs.', ['Node.js']), ['Runs on ', 'Node.js', ', not NodeXjs.']);
});

test('a title inside another word does not split', () => {
  assert.deepEqual(splitOnTitles('Undeadheaded deadheads.', ['deadhead']), ['Undeadheaded deadheads.']);
});

test('Upstreams: Story order first, then PR count, then name; hidden pulls vanish', () => {
  const p = fixturePortfolio();
  const groups = upstreamGroups(fixtureSnapshot().contributions, p.contributions);
  assert.deepEqual(groups.map(g => [g.repo, g.pulls.length]), [['withastro/astro', 2], ['sveltejs/svelte', 1]]);
  assert.equal(groups[0]!.pulls.find(pull => pull.number === 101)?.highlight, true);
  p.contributions.upstreams[0]!.pulls['101'] = { hidden: true, highlight: false };
  p.contributions.upstreams[0]!.pulls['102'] = { hidden: true, highlight: false };
  assert.deepEqual(upstreamGroups(fixtureSnapshot().contributions, p.contributions).map(g => g.repo), ['sveltejs/svelte']);
});

test('contribution totals count visible pulls and their upstreams once, for every page', () => {
  const p = fixturePortfolio();
  assert.deepEqual(contributionTotals(upstreamGroups(fixtureSnapshot().contributions, p.contributions)), { pulls: 3, upstreams: 2 });
  assert.deepEqual(contributionTotals([]), { pulls: 0, upstreams: 0 });
});

test("Contribution highlights follow their own pinned order, never the Upstream group's order", () => {
  const p = fixturePortfolio();
  p.contributions.upstreams[0]!.pulls['101'] = { hidden: false, highlight: true, order: 2 };
  p.contributions.upstreams.push({ repo: 'sveltejs/svelte', order: undefined, techs: [], works: [], pulls: { '7': { hidden: false, highlight: true, order: 1 } } });
  const groups = upstreamGroups(fixtureSnapshot().contributions, p.contributions);
  // withastro/astro (Story order 1) would sort first by group order; the pinned highlight order puts svelte first instead.
  assert.deepEqual(contributionHighlights(groups).map(h => [h.group.repo, h.pull.number]), [['sveltejs/svelte', 7], ['withastro/astro', 101]]);
});

test('an Upstream links to the merged pulls by the Handle, never to a count', () => {
  assert.equal(mergedPullsUrl('withastro/astro', 'cevdetch'), 'https://github.com/withastro/astro/pulls?q=is%3Apr+is%3Amerged+author%3Acevdetch');
});

test('availability reads as one line, with the capacity on employment and the country in place of the time zone', () => {
  const profile = fixturePortfolio().profile;
  assert.equal(availabilityLine(profile.availability, profile.country),
    'Open to part-time employment, contract and freelance work, remote or on site in Switzerland.');
});

test('availability still reads naturally with one workplace, or with no employment on offer', () => {
  const availability = fixturePortfolio().profile.availability;
  assert.equal(availabilityLine({ ...availability, workplace: ['remote'] }, 'Switzerland'),
    'Open to part-time employment, contract and freelance work, remote in Switzerland.');
  assert.equal(availabilityLine({ ...availability, openTo: ['contract', 'freelance'] }, 'Switzerland'),
    'Open to contract and freelance work, remote or on site in Switzerland.');
});

test('a weekly capacity leads the line and then covers every kind of work, never a schedule', () => {
  const availability = { ...fixturePortfolio().profile.availability, hoursPerWeek: 20 };
  assert.equal(availabilityLine(availability, 'Switzerland'),
    'Part-time, up to 20 hours a week. Open to employment, contract and freelance work, remote or on site in Switzerland.');
  assert.equal(availabilityLine({ ...availability, capacity: 'full-time', hoursPerWeek: 40, openTo: ['contract'] }, 'Switzerland'),
    'Full-time, up to 40 hours a week. Open to contract work, remote or on site in Switzerland.');
});

test('the bio takes its graduation year from the expected Education entry, never a typed date', () => {
  const { education } = fixturePortfolio();
  assert.deepEqual(fillBio('Studies alongside work (Matura {graduationYear}).', education),
    { text: 'Studies alongside work (Matura 2028).', problems: [] });
  assert.deepEqual(fillBio('Builds tools.', education), { text: 'Builds tools.', problems: [] });
  assert.deepEqual(fillBio('Since {startYear}.', education).problems, ['unknown token {startYear}']);
  const finished = education.map(entry => ({ ...entry, expected: false }));
  assert.deepEqual(fillBio('Matura {graduationYear}.', finished).problems,
    ['{graduationYear} needs exactly one expected Education entry']);
});

test('a language reads as its name and level, with native spelled out', () => {
  assert.equal(languageItem({ name: 'Turkish', level: 'native' }), 'Turkish (Native)');
  assert.equal(languageItem({ name: 'English', level: 'C1' }), 'English (C1)');
});

test('a social URL yields the handle in its path', () => {
  assert.equal(socialUsername('https://github.com/cevdetch'), 'cevdetch');
  assert.equal(socialUsername('https://www.linkedin.com/in/cevdetch/'), 'cevdetch');
  assert.equal(socialUsername('https://www.npmjs.com/~cevdetch'), 'cevdetch');
  assert.throws(() => socialUsername('https://github.com/'), /no username/);
});

test('Featured Works come in Featured order', () => {
  assert.deepEqual(featuredWorks(fixturePortfolio().works).map(w => w.id), ['deadhead']);
});

test('workFactsView exposes only the displayed Facts', () => {
  assert.deepEqual(workFactsView('deadhead', fixtureSnapshot()), {
    packages: fixtureSnapshot().works['deadhead']!.packages,
    license: 'MIT',
    active: { from: '2026-09-01T10:00:00Z', to: '2026-11-01T10:00:00Z' },
    commitCount: 412,
    release: { tag: 'v0.3.1', publishedAt: '2026-10-20T10:00:00Z' },
    icon: 'icons/deadhead.svg',
  });
  assert.deepEqual(workFactsView('homelab', fixtureSnapshot()), { packages: [] });
});

test('a cvLine fills {pkgbuilds} from the Snapshot and reports what it cannot fill', () => {
  const facts = fixtureSnapshot().works;
  assert.deepEqual(fillCvLine('{pkgbuilds} PKGBUILDs with audit tools.', facts['arch-waypure']), { text: '3 PKGBUILDs with audit tools.', problems: [] });
  assert.deepEqual(fillCvLine('No tokens here.', undefined), { text: 'No tokens here.', problems: [] });
  assert.deepEqual(fillCvLine('{pkgbuilds} recipes', facts['deadhead']), { text: '{pkgbuilds} recipes', problems: ['{pkgbuilds} has no Fact in the Snapshot'] });
  assert.deepEqual(fillCvLine('{stars} stars, {constructor}', facts['deadhead']).problems, ['unknown token {stars}', 'unknown token {constructor}']);
});

test('the numbers strip prefers a short headline, falling back to the full value and label', () => {
  const metric = { label: 'Sourced rules', value: '203', measuredAt: '2026-10-26', source: { label: 'deadhead release notes' } };
  assert.deepEqual(metricDisplay(metric), { value: '203', label: 'Sourced rules' });
  assert.deepEqual(metricDisplay({ ...metric, headline: { value: '203', label: 'sourced lint rules in deadhead' } }),
    { value: '203', label: 'sourced lint rules in deadhead' });
});

test('an Upstream label comes from the base Upstreams entry, or falls back to the repo id', () => {
  const p = fixturePortfolio();
  assert.equal(upstreamLabel('withastro/astro', p.contributions), 'Astro');
  assert.equal(upstreamLabel('unknown/unknown', p.contributions), 'unknown/unknown');
});

test("homeMetrics resolves each pin to its Work's Metric, by label", () => {
  const p = fixturePortfolio();
  assert.deepEqual(homeMetrics(p.profile.homeMetrics, p.works), [{ work: p.works[0], metric: p.works[0]!.data.metrics[0] }]);
});

test('Recently shipped merges published releases and merged Contributions, newest first, limited', () => {
  const p = fixturePortfolio();
  const snapshot = fixtureSnapshot();
  const shipped = recentlyShipped(snapshot, p.works, p.contributions, 3);
  assert.deepEqual(shipped.map(item => item.kind), ['release', 'contribution', 'contribution']);
  assert.deepEqual(shipped[0], {
    kind: 'release', at: '2026-10-20T10:00:00.000Z', work: p.works[0], package: 'deadhead', version: '0.3.1',
    url: 'https://www.npmjs.com/package/deadhead',
  });
  assert.deepEqual(shipped.slice(1).map(item => item.kind === 'contribution' ? [item.at, item.number] : []), [
    ['2026-07-01T08:22:12Z', 102],
    ['2026-06-30T10:00:00Z', 7],
  ]);
});

test('Recently shipped drops hidden Contributions and unpublished packages', () => {
  const p = fixturePortfolio();
  const snapshot = fixtureSnapshot();
  p.contributions.upstreams[0]!.pulls['102'] = { hidden: true, highlight: false };
  const shipped = recentlyShipped(snapshot, p.works, p.contributions, 10);
  assert.ok(!shipped.some(item => item.kind === 'contribution' && item.number === 102));
  assert.equal(shipped.filter(item => item.kind === 'release').length, 1);
  // Only svelte#7 remains a Contribution: astro#101 is highlighted (excluded below) and astro#102 is hidden.
  assert.equal(shipped.length, 2);
});

test('Recently shipped excludes highlighted pulls, so the same PR never shows twice on home', () => {
  const p = fixturePortfolio();
  const snapshot = fixtureSnapshot();
  // The fixture marks astro#101 as a highlight; it must never also appear in Recently shipped.
  const shipped = recentlyShipped(snapshot, p.works, p.contributions, 10);
  assert.ok(!shipped.some(item => item.kind === 'contribution' && item.number === 101));
  assert.deepEqual(shipped.flatMap(item => item.kind === 'contribution' ? [item.number] : []), [102, 7]);
});

test('formatting', () => {
  assert.equal(formatMonth('2022-03'), 'March 2022');
  assert.equal(formatMonth('2026-09-01T10:00:00Z'), 'September 2026');
  assert.equal(formatDay('2026-10-20T10:00:00Z'), '20 October 2026');
  assert.equal(joinList(['a'], 'and'), 'a');
  assert.equal(joinList(['a', 'b', 'c'], 'or'), 'a, b or c');
});
