import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCv, contributionLine, escapeMarkdown, languagesLine, socialNetworks } from '../../src/cv/model.ts';
import { availabilityLine } from '../../src/data/profile.ts';
import { upstreamGroups } from '../../src/data/views.ts';
import { fixturePortfolio, fixtureSnapshot } from '../helpers/portfolio-fixture.ts';

const data = () => ({ ...fixturePortfolio(), facts: fixtureSnapshot() });

test('sections: education above experience, projects strongest', () => {
  assert.deepEqual(Object.keys(buildCv(data()).cv.sections),
    ['summary', 'availability', 'education', 'experience', 'projects', 'open_source', 'skills', 'languages', 'interests']);
});

test('the public CV carries the email as its only contact detail', () => {
  const { cv } = buildCv(data());
  assert.equal(cv.email, 'hello@cevdet.ch');
  assert.equal(cv.name, 'Cevdet');
  assert.equal('phone' in cv, false);
  assert.equal('location' in cv, false);
  assert.equal(JSON.stringify(cv.sections.education).includes('location'), false);
});

test('project dates are Facts; Highlights are shared with the Case study', () => {
  const [project] = buildCv(data()).cv.sections.projects;
  assert.deepEqual(project, {
    name: '[deadhead](https://github.com/cevdetch/deadhead)',
    start_date: '2026-09', end_date: 'present',
    summary: 'Lints the HTML head against sourced rules. [Live site](https://deadhead.cevdet.ch/)',
    highlights: ['Generates the linter and its documentation from the same Markdown.'],
  });
});

test('availability, languages and contributions read as one line each', () => {
  const p = fixturePortfolio();
  assert.equal(availabilityLine(p.profile.availability),
    'Part-time; open to employment, contract and freelance work, remote or local. Time zone Europe/Zurich; replies within 2 working days.');
  assert.equal(languagesLine(p.profile.languages), '**Turkish, Kurdish** native · **English, French** C1 · **German** B1');
  assert.equal(contributionLine(upstreamGroups(fixtureSnapshot().contributions, p.contributions)),
    '3 merged pull requests to 2 upstream projects, including withastro/astro (2) and sveltejs/svelte.');
});

test('CV social networks come from the profile socials: LinkedIn, then GitHub, never npm', () => {
  assert.deepEqual(buildCv(data()).cv.social_networks, [{ network: 'LinkedIn', username: 'cevdetch' }, { network: 'GitHub', username: 'cevdetch' }]);
  assert.deepEqual(socialNetworks([
    { network: 'npm', url: 'https://www.npmjs.com/~cevdetch' }, { network: 'github', url: 'https://github.com/someone-else' },
  ]), [{ network: 'GitHub', username: 'someone-else' }]);
});

test('skills print CV categories only, in registry order', () => {
  assert.deepEqual(buildCv(data()).cv.sections.skills, [
    { label: 'Languages', details: 'TypeScript' },
    { label: 'Frameworks & styling', details: 'Astro' },
  ]);
});

test('Story text cannot inject Markdown', () => {
  assert.equal(escapeMarkdown('a_b *c* [d](e)'), 'a\\_b \\*c\\* \\[d\\](e)');
});

test('the CV date is the Snapshot date, so equal data renders equal CVs', () => {
  assert.equal(buildCv(data()).settings.current_date, '2026-11-09');
});
