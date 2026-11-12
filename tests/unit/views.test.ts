import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availabilityLine, socialUsername } from '../../src/data/profile.ts';
import { contributionTotals, featuredWorks, fillCvLine, inSourceOrder, mergedPullsUrl, newestFirst, skillGroups, splitOnTitles, upstreamGroups, workFactsView } from '../../src/data/views.ts';
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

test('an Upstream links to the merged pulls by the Handle, never to a count', () => {
  assert.equal(mergedPullsUrl('withastro/astro', 'cevdetch'), 'https://github.com/withastro/astro/pulls?q=is%3Apr+is%3Amerged+author%3Acevdetch');
});

test('availability reads as one line, with the capacity on employment and the country in place of the time zone', () => {
  const profile = fixturePortfolio().profile;
  assert.equal(availabilityLine(profile.availability, profile.country),
    'Open to part-time employment, contract and freelance work, remote or on site in Switzerland. Replies within 2 working days.');
});

test('availability still reads naturally with one workplace, or with no employment on offer', () => {
  const availability = fixturePortfolio().profile.availability;
  assert.equal(availabilityLine({ ...availability, workplace: ['remote'] }, 'Switzerland'),
    'Open to part-time employment, contract and freelance work, remote in Switzerland. Replies within 2 working days.');
  assert.equal(availabilityLine({ ...availability, openTo: ['contract', 'freelance'] }, 'Switzerland'),
    'Open to contract and freelance work, remote or on site in Switzerland. Replies within 2 working days.');
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

test('formatting', () => {
  assert.equal(formatMonth('2022-03'), 'March 2022');
  assert.equal(formatMonth('2026-09-01T10:00:00Z'), 'September 2026');
  assert.equal(formatDay('2026-10-20T10:00:00Z'), '20 October 2026');
  assert.equal(joinList(['a'], 'and'), 'a');
  assert.equal(joinList(['a', 'b', 'c'], 'or'), 'a, b or c');
});
