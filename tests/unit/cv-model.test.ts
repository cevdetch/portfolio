import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCv, escapeMarkdown, languagesLine, socialNetworks } from '../../src/cv/model.ts';
import { fixturePortfolio, fixtureSnapshot } from '../helpers/portfolio-fixture.ts';

const data = () => ({ ...fixturePortfolio(), facts: fixtureSnapshot() });
const openSource = (cv: ReturnType<typeof buildCv>) => Object.entries(cv.cv.sections).find(([key]) => key.startsWith('Open Source'))?.[1];
const pulls = (repo: string) => `https://github.com/${repo}/pulls?q=is%3Apr+is%3Amerged+author%3Acevdetch`;

test('sections: summary and education first, then projects, open source and experience; no availability', () => {
  assert.deepEqual(Object.keys(buildCv(data()).cv.sections),
    ['summary', 'education', 'projects', 'Open Source · Jun 2026 – Jul 2026', 'experience', 'skills', 'languages_&_writing']);
});

test('the open source heading carries the merge span, to present while the last merge is under 90 days old', () => {
  const p = data();
  p.facts.refreshedAt = '2026-09-01T00:00:00.000Z';
  assert.ok('Open Source · Jun 2026 – present' in buildCv(p).cv.sections);
  p.facts.contributions = [];
  p.contributions = { upstreams: [], themes: [] };
  assert.ok('open_source' in buildCv(p).cv.sections);
});

test('the header: name, title with specialisation, then country and time zone before the website, email, GitHub and LinkedIn', () => {
  const { cv } = buildCv(data());
  // RenderCV prints the contact items in key order, so the website is the first link.
  assert.deepEqual(Object.keys(cv), ['name', 'headline', 'location', 'website', 'email', 'social_networks', 'sections']);
  assert.equal(cv.website, 'https://cevdet.ch/');
  assert.equal(cv.name, 'Cevdet Haran');
  assert.equal(cv.headline, 'Software Developer · Web performance · Developer tooling · Open source');
  assert.equal(cv.location, 'Switzerland · Remote-friendly (Europe/Zurich)');
  assert.equal(cv.email, 'hello@cevdet.ch');
});

test('with a portrait, the header names the photo RenderCV prints beside it, by its file name next to the model', () => {
  assert.equal('photo' in buildCv(data()).cv, false);
  const { cv } = buildCv(data(), 'cevdet-haran.jpg');
  assert.equal(cv.photo, 'cevdet-haran.jpg');
  assert.deepEqual(Object.keys(cv).slice(0, 2), ['name', 'photo']);
});

test('the location names no city and drops "Remote-friendly" when remote work is not offered', () => {
  const p = data();
  p.profile.availability.workplace = ['local'];
  assert.equal(buildCv(p).cv.location, 'Switzerland · Europe/Zurich');
});

test('the time zone is Markdown-escaped too, so an underscore does not italicise the rest of the line', () => {
  const p = data();
  p.profile.availability.timeZone = 'America/Los_Angeles';
  assert.equal(buildCv(p).cv.location, 'Switzerland · Remote-friendly (America/Los\\_Angeles)');
});

test('the public CV has no phone, and no entry carries a location but Remote', () => {
  const { cv } = buildCv(data());
  assert.equal('phone' in cv, false);
  assert.equal(JSON.stringify(cv.sections.education).includes('location'), false);
  assert.equal(JSON.stringify(cv.sections.projects).includes('location'), false);
});

test('education prints an expected end date alone, marked Expected, and the note as a highlight', () => {
  const p = data();
  assert.deepEqual(buildCv(p).cv.sections.education, [{
    institution: 'Collège Sismondi', degree: 'Maturité gymnasiale', area: 'Physics and Applied Mathematics',
    date: '2028-06', expected: 'Expected', highlights: [],
  }]);
  p.education = [{ ...p.education[0]!, expected: false, note: 'Matura thesis: a grade_tracker.' }];
  assert.deepEqual(buildCv(p).cv.sections.education[0], {
    institution: 'Collège Sismondi', degree: 'Maturité gymnasiale', area: 'Physics and Applied Mathematics',
    start_date: '2024-08', end_date: '2028-06', highlights: ['Matura thesis: a grade\\_tracker.'],
  });
});

test('a single-Work project prints its highlights, its repo and site, and Fact dates', () => {
  const [project] = buildCv(data()).cv.sections.projects;
  assert.deepEqual(project, {
    name: '[deadhead](https://github.com/cevdetch/deadhead) · [deadhead.cevdet.ch](https://deadhead.cevdet.ch/)',
    start_date: '2026-09', end_date: 'present',
    highlights: ['Generates the linter and its documentation from the same Markdown.'],
  });
});

test('a finished single Work ends at its last commit', () => {
  const p = data();
  p.works[0]!.data.status = 'complete';
  delete p.works[0]!.data.site;
  const [project] = buildCv(p).cv.sections.projects;
  assert.equal(project!['name'], '[deadhead](https://github.com/cevdetch/deadhead)');
  assert.equal(project!['end_date'], '2026-11');
});

test('projects follow cv.yaml, decoupled from Featured, and optional entries stay off', () => {
  assert.deepEqual(buildCv(data()).cv.sections.projects.map(project => project['name']),
    ['[deadhead](https://github.com/cevdetch/deadhead) · [deadhead.cevdet.ch](https://deadhead.cevdet.ch/)', 'Astro templates']);
});

test('a titled entry prints one cvLine per Work, from its first commit to its latest status', () => {
  assert.deepEqual(buildCv(data()).cv.sections.projects[1], {
    name: 'Astro templates', start_date: '2026-10', end_date: 'present',
    highlights: ['[Astro Minimal Template](https://github.com/cevdetch/astro-minimal-template): strictest TypeScript, with no client JavaScript.'],
  });
});

test('a private repository is never linked from the CV', () => {
  const p = data();
  p.cv.projects = [{ works: ['private-tool'], optional: false }];
  assert.equal(buildCv(p).cv.sections.projects[0]!['name'], 'Private tool');
});

test('a group fills {pkgbuilds} from the Snapshot and takes its earliest start', () => {
  const p = data();
  p.cv.projects[2]!.optional = false;
  assert.deepEqual(buildCv(p).cv.sections.projects[2], {
    name: 'Linux & infrastructure', start_date: '2025-12', end_date: 'present',
    highlights: [
      '[arch-waypure](https://github.com/cevdetch/arch-waypure): 3 PKGBUILDs with Python audit tools.',
      'Private tool: self-hosted services with no public ports.',
    ],
  });
});

test('a group of finished Works ends at the latest last commit; a group without Facts has no dates', () => {
  const p = data();
  for (const work of p.works) work.data.status = 'complete';
  p.cv.projects = [{ title: 'Packaging', works: ['astro-minimal-template', 'arch-waypure'], optional: false }, { title: 'Server', works: ['private-tool'], optional: false }];
  const [packaging, server] = buildCv(p).cv.sections.projects;
  assert.equal(packaging!['start_date'], '2025-12');
  assert.equal(packaging!['end_date'], '2026-11');
  assert.deepEqual(Object.keys(server!), ['name', 'highlights']);
});

test('open source prints one line per theme: lead, linked labels, note; no counts', () => {
  assert.deepEqual(openSource(buildCv(data())), [{
    bullet: `HTML-head fixes merged into [Astro](${pulls('withastro/astro')}) and [Svelte](${pulls('sveltejs/svelte')}), including a sitemap\\_index fix in Astro.`,
  }]);
  const p = data();
  delete p.contributions.themes[0]!.note;
  p.contributions.themes[0]!.upstreams.pop();
  assert.deepEqual(openSource(buildCv(p)), [{ bullet: `HTML-head fixes merged into [Astro](${pulls('withastro/astro')}).` }]);
});

test('skills come from cv.yaml with its labels, and a display label names several Techs', () => {
  assert.deepEqual(buildCv(data()).cv.sections.skills, [
    { label: 'Languages', details: 'TypeScript' },
    { label: 'Desktop', details: 'Sway\\_and Molly, Astro' },
  ]);
});

test('languages and the cv interests close the CV as one section, linking the Work site the details name', () => {
  assert.deepEqual(buildCv(data()).cv.sections['languages_&_writing'], [
    { label: 'Languages', details: 'Turkish (Native) · Kurdish (Native) · English (C1) · French (C1) · German (B1)' },
    { label: 'Writing', details: 'Philosophical essays, published at [one.cevdet.ch](https://one.cevdet.ch/)' },
  ]);
  const p = data();
  p.profile.interests = p.profile.interests.map(interest => ({ ...interest, cv: false }));
  const { sections } = buildCv(p).cv;
  assert.equal('languages_&_writing' in sections, false);
  assert.deepEqual(sections['languages'], [{ label: 'Languages', details: 'Turkish (Native) · Kurdish (Native) · English (C1) · French (C1) · German (B1)' }]);
});

test('languages read as one line, one item per language with its own level', () => {
  assert.equal(languagesLine(fixturePortfolio().profile.languages), 'Turkish (Native) · Kurdish (Native) · English (C1) · French (C1) · German (B1)');
});

test('CV social networks come from the profile socials: GitHub, then LinkedIn, never npm', () => {
  assert.deepEqual(buildCv(data()).cv.social_networks, [{ network: 'GitHub', username: 'cevdetch' }, { network: 'LinkedIn', username: 'cevdetch' }]);
  assert.deepEqual(socialNetworks([
    { network: 'npm', url: 'https://www.npmjs.com/~cevdetch' }, { network: 'github', url: 'https://github.com/someone-else' },
  ]), [{ network: 'GitHub', username: 'someone-else' }]);
});

test('Story text cannot inject Markdown', () => {
  assert.equal(escapeMarkdown('a_b *c* [d](e)'), 'a\\_b \\*c\\* \\[d\\](e)');
});

test('months print as standard three-letter abbreviations, "Sep" rather than RenderCV\'s "Sept"', () => {
  assert.deepEqual(buildCv(data()).locale, {
    language: 'english',
    month_abbreviations: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  });
});

test('the CV date is the Snapshot date, so equal data renders equal CVs', () => {
  assert.equal(buildCv(data()).settings.current_date, '2026-11-09');
});
