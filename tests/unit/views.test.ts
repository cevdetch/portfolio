import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availabilityLine, fillBio, languageItem, languageLevels, otherWorkLine, pageTitle, placementLine, socialUsername } from '../../src/data/profile.ts';
import { contributionHighlights, contributionSpan, discussionLine, contributionTotals, featuredWorks, fillCvLine, firstCitations, homeMetrics, inSourceOrder, knowsAboutTechs, lighthouseMethod, lighthouseNumber, mergedPullsUrl, metricDisplay, newestFirst, recentlyShipped, skillGroups, splitOnTitles, upstreamGroups, upstreamLabel, workFactsView } from '../../src/data/views.ts';
import { formatDay, formatDayRange, formatMonth, formatMonthRange, joinList } from '../../src/lib/format.ts';
import { techSchema } from '../../src/schemas/tech.ts';
import { statusMeanings, workStatuses } from '../../src/schemas/work.ts';
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

test('Upstreams: Story order first, then PR count, then name; hidden pulls stay listed, flagged', () => {
  const p = fixturePortfolio();
  const groups = upstreamGroups(fixtureSnapshot().contributions, p.contributions);
  assert.deepEqual(groups.map(g => [g.repo, g.pulls.length]), [['withastro/astro', 2], ['sveltejs/svelte', 1]]);
  assert.equal(groups[0]!.pulls.find(pull => pull.number === 101)?.highlight, true);
  p.contributions.upstreams[0]!.pulls['102'] = { hidden: true, highlight: false };
  const flagged = upstreamGroups(fixtureSnapshot().contributions, p.contributions);
  // /open-source/ lists every merged pull; hidden only keeps one off the home page.
  assert.deepEqual(flagged.map(g => [g.repo, g.pulls.length]), [['withastro/astro', 2], ['sveltejs/svelte', 1]]);
  assert.deepEqual(flagged[0]!.pulls.map(pull => [pull.number, pull.hidden]), [[102, true], [101, false]]);
});

test('contribution totals count every listed pull, hidden ones included, and each Upstream once', () => {
  const p = fixturePortfolio();
  assert.deepEqual(contributionTotals(upstreamGroups(fixtureSnapshot().contributions, p.contributions)), { pulls: 3, upstreams: 2 });
  p.contributions.upstreams[1]!.pulls['7'] = { hidden: true, highlight: false };
  assert.deepEqual(contributionTotals(upstreamGroups(fixtureSnapshot().contributions, p.contributions)), { pulls: 3, upstreams: 2 });
  assert.deepEqual(contributionTotals([]), { pulls: 0, upstreams: 0 });
});

test('the merge span runs from the first to the last non-hidden merged pull, ongoing under 90 days after the refresh', () => {
  const p = fixturePortfolio();
  const snapshot = fixtureSnapshot();
  assert.deepEqual(contributionSpan(snapshot.contributions, p.contributions, snapshot.refreshedAt),
    { from: '2026-06-24T12:35:44Z', to: '2026-07-01T08:22:12Z', ongoing: false });
  assert.equal(contributionSpan(snapshot.contributions, p.contributions, '2026-09-28T08:22:12Z')?.ongoing, true);
  assert.equal(contributionSpan(snapshot.contributions, p.contributions, '2026-09-29T08:22:12Z')?.ongoing, false);
  p.contributions.upstreams[0]!.pulls['101'] = { hidden: true, highlight: false };
  assert.equal(contributionSpan(snapshot.contributions, p.contributions, snapshot.refreshedAt)?.from, '2026-06-30T10:00:00Z');
  // /open-source/ dates the same pulls it lists and counts, hidden ones included.
  assert.equal(contributionSpan(snapshot.contributions, p.contributions, snapshot.refreshedAt, true)?.from, '2026-06-24T12:35:44Z');
  assert.equal(contributionSpan([], p.contributions, snapshot.refreshedAt), undefined);
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

test('page titles credit the full name; the home page leads with it and the job title', () => {
  const { profile } = fixturePortfolio();
  assert.equal(pageTitle(profile, 'Hire'), 'Hire - Cevdet Haran');
  assert.equal(pageTitle(profile), 'Cevdet Haran - Software Developer');
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

test('the placement line tells an employer the roles, the weekly capacity, the languages and the place', () => {
  const profile = fixturePortfolio().profile;
  const availability = { ...profile.availability, hoursPerWeek: 20, internships: true };
  assert.equal(placementLine({ ...profile, availability }),
    'Open to part-time roles and internships, up to 20 hours a week. Turkish and Kurdish (native), English and French (C1), German (B1). Switzerland, Europe/Zurich.');
  assert.equal(placementLine({ ...profile, availability: { ...availability, internships: false, hoursPerWeek: undefined } }),
    'Open to part-time roles. Turkish and Kurdish (native), English and French (C1), German (B1). Switzerland, Europe/Zurich.');
  assert.equal(placementLine({ ...profile, availability, languages: [] }),
    'Open to part-time roles and internships, up to 20 hours a week. Switzerland, Europe/Zurich.');
  // No employment on offer, no placement line.
  assert.equal(placementLine({ ...profile, availability: { ...availability, openTo: ['contract', 'freelance'] } }), undefined);
});

test('the languages group by level, natives first and the other levels in data order', () => {
  const { languages } = fixturePortfolio().profile;
  assert.equal(languageLevels(languages), 'Turkish and Kurdish (native), English and French (C1), German (B1)');
  assert.equal(languageLevels([{ name: 'English', level: 'C1' }]), 'English (C1)');
  assert.equal(languageLevels([{ name: 'Turkish', level: 'native' }]), 'Turkish (native)');
  // A native language listed after the others still leads.
  assert.equal(languageLevels([{ name: 'German', level: 'B1' }, { name: 'Turkish', level: 'native' }, { name: 'English', level: 'C1' }]),
    'Turkish (native), German (B1), English (C1)');
  assert.equal(languageLevels([]), undefined);
});

test('beside the placement line, the other kinds of work follow on their own', () => {
  const availability = fixturePortfolio().profile.availability;
  assert.equal(otherWorkLine(availability, 'Switzerland'), 'Also open to contract and freelance work, remote or on site in Switzerland.');
  // The weekly hours on the placement line bound this work too.
  assert.equal(otherWorkLine({ ...availability, hoursPerWeek: 20 }, 'Switzerland'),
    'Also open to contract and freelance work within those hours, remote or on site in Switzerland.');
  assert.equal(otherWorkLine({ ...availability, openTo: ['employment'] }, 'Switzerland'), undefined);
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

test('each Work counts as first cited only under the first Service that names it, so its caveat shows once', () => {
  assert.deepEqual(firstCitations([
    { evidence: ['deadhead', 'astro-minimal-template'] },
    { evidence: ['astro-reels-template'] },
    { evidence: ['astro-minimal-template', 'deadhead', 'astro-reels-template', 'one'] },
  ]), [['deadhead', 'astro-minimal-template'], ['astro-reels-template'], ['one']]);
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

test('workFactsView gives a repository link only for a repo the Snapshot found public', () => {
  const snapshot = fixtureSnapshot();
  assert.equal(workFactsView('deadhead', snapshot, { repo: 'cevdetch/deadhead' }).repoUrl, 'https://github.com/cevdetch/deadhead');
  assert.equal(workFactsView('private-tool', snapshot, { repo: 'cevdetch/private-tool' }).repoUrl, undefined);
  assert.equal(workFactsView('deadhead', snapshot).repoUrl, undefined);
  delete snapshot.works['deadhead']!.repo;
  assert.equal(workFactsView('deadhead', snapshot, { repo: 'cevdetch/deadhead' }).repoUrl, undefined);
});

test('workFactsView marks a Story-declared private source with no Facts and no repository named', () => {
  const snapshot = fixtureSnapshot();
  assert.deepEqual(workFactsView('branding', snapshot, { source: 'private' }), { packages: [], sourcePrivate: true });
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
  assert.deepEqual(workFactsView('private-tool', fixtureSnapshot()), { packages: [], sourcePrivate: true });
  const withRules = fixtureSnapshot();
  withRules.works['deadhead']!.rules = { total: 203, head: 92 };
  assert.deepEqual(workFactsView('deadhead', withRules).rules, { total: 203, head: 92 });
  assert.deepEqual(workFactsView('missing', fixtureSnapshot()), { packages: [] });
});

test('a cvLine fills {pkgbuilds} from the Snapshot and reports what it cannot fill', () => {
  const facts = fixtureSnapshot().works;
  assert.deepEqual(fillCvLine('{pkgbuilds} PKGBUILDs with audit tools.', facts['arch-waypure']), { text: '3 PKGBUILDs with audit tools.', problems: [] });
  assert.deepEqual(fillCvLine('No tokens here.', undefined), { text: 'No tokens here.', problems: [] });
  assert.deepEqual(fillCvLine('{pkgbuilds} recipes', facts['deadhead']), { text: '{pkgbuilds} recipes', problems: ['{pkgbuilds} has no Fact in the Snapshot'] });
  assert.deepEqual(fillCvLine('{stars} stars, {constructor}', facts['deadhead']).problems, ['unknown token {stars}', 'unknown token {constructor}']);
});

test('{lighthouse} adds the perfect-score clause only when every Work in the entry scores 100 in all four categories', () => {
  const perfect = { performance: 100, accessibility: 100, bestPractices: 100, seo: 100, measuredAt: '2026-11-21T00:30:00.000Z' };
  const scored = (lighthouse?: typeof perfect) => ({ packages: [], ...(lighthouse ? { lighthouse } : {}) });
  const line = 'a reels-style feed in HTML and CSS alone{lighthouse}.';
  assert.deepEqual(fillCvLine(line, scored(perfect), [{ kind: 'template', facts: scored(perfect) }]),
    { text: 'a reels-style feed in HTML and CSS alone, its demo home page scoring 100 in all four mobile Lighthouse categories.', problems: [] });
  // Only a template's site is a demo.
  assert.equal(fillCvLine(line, scored(perfect)).text,
    'a reels-style feed in HTML and CSS alone, its home page scoring 100 in all four mobile Lighthouse categories.');
  const both = [{ kind: 'template' as const, facts: scored(perfect) }, { kind: 'template' as const, facts: scored(perfect) }];
  assert.equal(fillCvLine(line, both[1]!.facts, both).text,
    "a reels-style feed in HTML and CSS alone, both templates' demo home pages scoring 100 in all four mobile Lighthouse categories.");
  const three = [...both, { kind: 'site' as const, facts: scored(perfect) }];
  assert.equal(fillCvLine(line, three[0]!.facts, three).text,
    "a reels-style feed in HTML and CSS alone, all 3 projects' home pages scoring 100 in all four mobile Lighthouse categories.");
  // One score under 100 anywhere in the entry, or a Work never measured, drops the clause: a lower number is never printed.
  for (const other of [scored({ ...perfect, seo: 92 }), scored({ ...perfect, performance: 99 }), scored()]) {
    assert.deepEqual(fillCvLine(line, both[0]!.facts, [both[0]!, { kind: 'template', facts: other }]),
      { text: 'a reels-style feed in HTML and CSS alone.', problems: [] });
  }
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
  const shipped = recentlyShipped(snapshot, p.works, p.contributions, 3, 'cevdetch');
  assert.deepEqual(shipped.map(item => item.kind), ['release', 'contribution', 'contribution']);
  assert.deepEqual(shipped[0], {
    kind: 'release', at: '2026-10-20T10:00:00.000Z', work: p.works[0], registry: 'npm', package: 'deadhead', version: '0.3.1',
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
  const shipped = recentlyShipped(snapshot, p.works, p.contributions, 10, 'cevdetch');
  assert.ok(!shipped.some(item => item.kind === 'contribution' && item.number === 102));
  assert.equal(shipped.filter(item => item.kind === 'release').length, 1);
  // Only svelte#7 remains a Contribution: astro#101 is highlighted (excluded below) and astro#102 is hidden.
  assert.equal(shipped.length, 2);
});

test('Recently shipped shows two same-day releases of one Work as one line, with the higher version', () => {
  const p = fixturePortfolio();
  const snapshot = fixtureSnapshot();
  const npm = (name: string, version: string, releasedAt: string) => ({
    registry: 'npm' as const, name, published: true as const, version, releasedAt, url: `https://www.npmjs.com/package/${name}`,
  });
  snapshot.works['deadhead']!.packages = [
    npm('deadhead', '0.3.1', '2026-10-20T19:37:08.506Z'),
    npm('eslint-plugin-deadhead', '0.10.0', '2026-10-20T19:35:35.071Z'),
    npm('deadhead-old', '0.9.0', '2026-10-19T23:59:00.000Z'),
  ];
  const releases = recentlyShipped(snapshot, p.works, p.contributions, 10, 'cevdetch').flatMap(item => item.kind === 'release' ? [[item.package, item.version, item.at]] : []);
  assert.deepEqual(releases, [
    ['eslint-plugin-deadhead', '0.10.0', '2026-10-20T19:35:35.071Z'],
    ['deadhead-old', '0.9.0', '2026-10-19T23:59:00.000Z'],
  ]);
  // Equal versions keep the package named after the Work, even when the plugin was published later.
  snapshot.works['deadhead']!.packages[1] = npm('eslint-plugin-deadhead', '0.3.1', '2026-10-20T19:39:35.071Z');
  const named = () => recentlyShipped(snapshot, p.works, p.contributions, 10, 'cevdetch').flatMap(item => item.kind === 'release' ? [item.package] : []);
  assert.deepEqual(named(), ['deadhead', 'deadhead-old']);
  // With neither named after the Work, equal versions keep the newer release.
  snapshot.works['deadhead']!.packages[0] = npm('deadhead-cli', '0.3.1', '2026-10-20T19:37:08.506Z');
  assert.deepEqual(named(), ['eslint-plugin-deadhead', 'deadhead-old']);
});

test('a highlight cites its review discussion only from three comments up', () => {
  assert.equal(discussionLine({ comments: 13 }), '13 comments in review');
  assert.equal(discussionLine({ comments: 3 }), '3 comments in review');
  assert.equal(discussionLine({ comments: 2 }), undefined);
  assert.equal(discussionLine(undefined), undefined);
});

test('Recently shipped collapses pulls to one Upstream merged within 7 days of each other, dated by the newest', () => {
  const p = fixturePortfolio();
  const snapshot = fixtureSnapshot();
  const pull = (number: number, mergedAt: string) => ({
    upstream: 'withastro/astro', number, title: `Fix ${number}`, url: `https://github.com/withastro/astro/pull/${number}`, mergedAt,
  });
  // astro#102 (1 July) chains to #103 (25 June) and #104 (19 June); #105 (11 June) is 8 days older and stands alone.
  snapshot.contributions.push(pull(103, '2026-06-25T09:00:00Z'), pull(104, '2026-06-19T09:00:00Z'), pull(105, '2026-06-11T08:00:00Z'));
  const shipped = recentlyShipped(snapshot, p.works, p.contributions, 10, 'cevdetch').filter(item => item.kind !== 'release');
  assert.deepEqual(shipped, [
    {
      kind: 'pulls', at: '2026-07-01T08:22:12Z', from: '2026-06-19T09:00:00Z', repo: 'withastro/astro', label: 'Astro', count: 3,
      url: 'https://github.com/withastro/astro/pulls?q=is%3Apr+is%3Amerged+author%3Acevdetch',
    },
    { kind: 'contribution', at: '2026-06-30T10:00:00Z', repo: 'sveltejs/svelte', label: 'Svelte', number: 7, title: 'Fix a typo', url: 'https://github.com/sveltejs/svelte/pull/7' },
    { kind: 'contribution', at: '2026-06-11T08:00:00Z', repo: 'withastro/astro', label: 'Astro', number: 105, title: 'Fix 105', url: 'https://github.com/withastro/astro/pull/105' },
  ]);
});

test('a pull labelled by what it touched shows under its own label, and only pulls sharing a label collapse', () => {
  const p = fixturePortfolio();
  const snapshot = fixtureSnapshot();
  const pull = (number: number, mergedAt: string) => ({
    upstream: 'withastro/astro', number, title: `Fix ${number}`, url: `https://github.com/withastro/astro/pull/${number}`, mergedAt,
  });
  // #103 falls inside the burst of #102 and #104 by date, but touched only test fixtures.
  snapshot.contributions.push(pull(103, '2026-06-28T09:00:00Z'), pull(104, '2026-06-26T09:00:00Z'));
  p.contributions.upstreams[0]!.pulls['103'] = { hidden: false, highlight: false, label: 'Astro test fixtures' };
  const shipped = recentlyShipped(snapshot, p.works, p.contributions, 10, 'cevdetch')
    .flatMap(item => item.kind === 'release' || item.repo !== 'withastro/astro' ? [] : [[item.kind, item.label, item.kind === 'pulls' ? item.count : item.number]]);
  assert.deepEqual(shipped, [
    ['pulls', 'Astro', 2],
    ['contribution', 'Astro test fixtures', 103],
  ]);
  const groups = upstreamGroups(snapshot.contributions, p.contributions);
  assert.deepEqual(groups[0]!.pulls.map(item => [item.number, item.label]), [[102, 'Astro'], [101, 'Astro'], [103, 'Astro test fixtures'], [104, 'Astro']]);
});

test("a burst links to GitHub's search for its merge days, unless another pull merged on those days", () => {
  const p = fixturePortfolio();
  const snapshot = fixtureSnapshot();
  const pull = (number: number, mergedAt: string) => ({
    upstream: 'withastro/astro', number, title: `Fix ${number}`, url: `https://github.com/withastro/astro/pull/${number}`, mergedAt,
  });
  // Without the highlighted #101 (24 June), only the burst's own pulls merged between 19 June and 1 July.
  snapshot.contributions = snapshot.contributions.filter(item => item.number !== 101);
  snapshot.contributions.push(pull(103, '2026-06-25T09:00:00Z'), pull(104, '2026-06-19T23:30:00Z'));
  const burstUrl = () => recentlyShipped(snapshot, p.works, p.contributions, 10, 'cevdetch').flatMap(item => item.kind === 'pulls' ? [item.url] : []);
  assert.deepEqual(burstUrl(), ['https://github.com/withastro/astro/pulls?q=is%3Apr+is%3Amerged+author%3Acevdetch+merged%3A2026-06-19..2026-07-01']);
  // A pull under another label merged inside the range would show in the search, so the link drops the dates.
  snapshot.contributions.push(pull(105, '2026-06-22T09:00:00Z'));
  p.contributions.upstreams[0]!.pulls['105'] = { hidden: false, highlight: false, label: 'Astro test fixtures' };
  assert.deepEqual(burstUrl(), ['https://github.com/withastro/astro/pulls?q=is%3Apr+is%3Amerged+author%3Acevdetch']);
});

test('Contribution highlights skip hidden pulls', () => {
  const p = fixturePortfolio();
  p.contributions.upstreams[0]!.pulls['101'] = { hidden: true, highlight: true };
  assert.deepEqual(contributionHighlights(upstreamGroups(fixtureSnapshot().contributions, p.contributions)), []);
});

test('Recently shipped excludes highlighted pulls, so the same PR never shows twice on home', () => {
  const p = fixturePortfolio();
  const snapshot = fixtureSnapshot();
  // The fixture marks astro#101 as a highlight; it must never also appear in Recently shipped.
  const shipped = recentlyShipped(snapshot, p.works, p.contributions, 10, 'cevdetch');
  assert.ok(!shipped.some(item => item.kind === 'contribution' && item.number === 101));
  assert.deepEqual(shipped.flatMap(item => item.kind === 'contribution' ? [item.number] : []), [102, 7]);
});

test('a day range names the shared month and year once', () => {
  assert.equal(formatDayRange('2026-06-23T22:31:47Z', '2026-07-01T08:22:12Z'), '23 June – 1 July 2026');
  assert.equal(formatDayRange('2026-06-23T22:31:47Z', '2026-06-30T08:22:12Z'), '23–30 June 2026');
  assert.equal(formatDayRange('2025-12-30T00:00:00Z', '2026-01-02T00:00:00Z'), '30 December 2025 – 2 January 2026');
  assert.equal(formatDayRange('2026-06-30T01:00:00Z', '2026-06-30T20:00:00Z'), '30 June 2026');
});

test('formatting', () => {
  assert.equal(formatMonth('2022-03'), 'March 2022');
  assert.equal(formatMonth('2026-09-01T10:00:00Z'), 'September 2026');
  assert.equal(formatDay('2026-10-20T10:00:00Z'), '20 October 2026');
  assert.equal(joinList(['a'], 'and'), 'a');
  assert.equal(joinList(['a', 'b', 'c'], 'or'), 'a, b or c');
});

test('workFactsView gives the Lighthouse scores of a Work with a site, linked to the live mobile analysis', () => {
  assert.deepEqual(workFactsView('deadhead', fixtureSnapshot(), { site: 'https://deadhead.cevdet.ch/' }).lighthouse, {
    performance: 98, accessibility: 100, bestPractices: 100, seo: 100, measuredAt: '2026-11-07T05:20:00.000Z',
    analysisUrl: 'https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fdeadhead.cevdet.ch%2F&form_factor=mobile',
  });
  assert.equal(workFactsView('deadhead', fixtureSnapshot(), { repo: 'cevdetch/deadhead' }).lighthouse, undefined);
  assert.equal(workFactsView('astro-minimal-template', fixtureSnapshot(), { site: 'https://astro-minimal-template.pages.dev/' }).lighthouse, undefined);
});

test('the Lighthouse Number is the lowest mobile Performance score across the measured sites, linked to that site', () => {
  const p = fixturePortfolio();
  assert.deepEqual(lighthouseNumber(p.works, fixtureSnapshot()), {
    value: '98', label: "lowest mobile Lighthouse Performance score of the 2 live sites' home pages",
    source: { label: 'PageSpeed Insights', url: 'https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fdeadhead.cevdet.ch%2F&form_factor=mobile' },
    // The oldest measurement among the sites, so the date never claims a site was measured later than it was.
    measuredAt: '2026-11-07T05:20:00.000Z',
  });
  const one = fixtureSnapshot();
  delete one.works['deadhead']!.lighthouse;
  // One site has no lowest: the label names the only one instead of counting it.
  assert.equal(lighthouseNumber(p.works, one)?.label, "mobile Lighthouse Performance score of the only live site's home page");
  assert.equal(lighthouseNumber(p.works, one)?.measuredAt, '2026-11-07T05:21:00.000Z');
  delete one.works['one']!.lighthouse;
  assert.equal(lighthouseNumber(p.works, one), undefined);
});

test('the Lighthouse method names the page, the device, the runs and how they combine', () => {
  assert.equal(lighthouseMethod(), 'on the home page (mobile; performance the best of 5 runs, the rest the median)');
});

test('a month range names one month when it starts and ends in it', () => {
  assert.equal(formatMonthRange('2026-11-08T10:00:00Z', '2026-11-21T10:00:00Z'), 'November 2026');
  assert.equal(formatMonthRange('2026-09-09T10:00:00Z', '2026-11-21T10:00:00Z'), 'September 2026 to November 2026');
  assert.equal(formatMonthRange('2025-11-30T10:00:00Z', '2026-11-01T10:00:00Z'), 'November 2025 to November 2026');
});

test('every status has a meaning a reader can see', () => {
  for (const status of workStatuses) assert.ok(statusMeanings[status].length > 0, status);
});

test('AI skills show on /skills/, but reach knowsAbout only where a Work uses them', () => {
  const p = fixturePortfolio();
  const techs = [...p.techs, ...[
    { id: 'llms-txt', label: 'AI-ready documentation', category: 'ai', url: 'https://llmstxt.org/' },
    { id: 'llm-integration', label: 'AI integration (LLM APIs, agent tooling)', category: 'ai', url: 'https://en.wikipedia.org/wiki/Large_language_model' },
  ].map(tech => techSchema.parse(tech))];
  p.works[0]!.data.stack.push('llms-txt');
  const ai = skillGroups(techs, p.works).find(group => group.category === 'ai');
  assert.deepEqual(ai?.techs.map(t => [t.tech.id, t.works.map(w => w.id)]), [['llms-txt', ['deadhead']], ['llm-integration', []]]);
  assert.deepEqual(knowsAboutTechs(techs, p.works, p.contributions).map(tech => tech.id), ['typescript', 'astro', 'llms-txt']);
});

test('knowsAbout keeps the skills, but desktop entries only where a Work or a Contribution uses them', () => {
  const p = fixturePortfolio();
  // Sway is a desktop entry no fixture Work uses, so it stays on /skills/ and /uses/ but leaves knowsAbout.
  assert.deepEqual(knowsAboutTechs(p.techs, p.works, p.contributions).map(tech => tech.id), ['typescript', 'astro']);
  p.works[0]!.data.stack.push('sway');
  assert.deepEqual(knowsAboutTechs(p.techs, p.works, p.contributions).map(tech => tech.id), ['typescript', 'astro', 'sway']);
  p.works[0]!.data.stack.pop();
  p.contributions.upstreams[1]!.techs.push('sway');
  assert.deepEqual(knowsAboutTechs(p.techs, p.works, p.contributions).map(tech => tech.id), ['typescript', 'astro', 'sway']);
});
