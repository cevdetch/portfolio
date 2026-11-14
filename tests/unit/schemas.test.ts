import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isoDate } from '../../src/schemas/common.ts';
import { techSchema, techCategories } from '../../src/schemas/tech.ts';
import { headlineMatchesValue, metricSchema, workSchema, workTranslationSchema } from '../../src/schemas/work.ts';
import { profileSchema } from '../../src/schemas/profile.ts';
import { educationSchema } from '../../src/schemas/background.ts';
import { contributionOverridesSchema } from '../../src/schemas/contributions.ts';
import { cvSchema } from '../../src/schemas/cv.ts';

const work = {
  title: 'deadhead', kind: 'package', status: 'maintained', featured: true, order: 1,
  repo: 'cevdetch/deadhead', site: 'https://deadhead.cevdet.ch/',
  packages: [{ registry: 'npm', name: 'deadhead' }], stack: ['typescript'],
  tagline: 'An HTML head linter: CLI, ESLint plugin and browser playground',
  summary: 'Lints the HTML head against sourced rules.', role: 'Creator and maintainer',
  highlights: ['Generates the linter and its documentation from the same Markdown.'],
};

test('isoDate accepts YAML dates and strings and yields YYYY-MM-DD', () => {
  assert.equal(isoDate.parse('2026-10-04'), '2026-10-04');
  assert.equal(isoDate.parse(new Date('2026-10-04T00:00:00Z')), '2026-10-04');
  assert.throws(() => isoDate.parse('04.10.2026'));
});

test('work applies defaults and enforces Story lengths', () => {
  const parsed = workSchema.parse(work);
  assert.deepEqual(parsed.metrics, []);
  assert.equal(parsed.pkgbuilds, false);
  assert.throws(() => workSchema.parse({ ...work, tagline: 'x'.repeat(71) }));
  assert.throws(() => workSchema.parse({ ...work, summary: 'x'.repeat(161) }));
  assert.throws(() => workSchema.parse({ ...work, highlights: ['a', 'b', 'c', 'd'] }));
});

test('a headline value derives from the full value, as its leading number or a rounded percentage', () => {
  assert.equal(headlineMatchesValue('203', '203'), true);
  assert.equal(headlineMatchesValue('4,570 of 10,000 targets', '4,570'), true);
  assert.equal(headlineMatchesValue('100 each', '100'), true);
  assert.equal(headlineMatchesValue('20.4% over 568 rasters', '20%'), true);
  assert.equal(headlineMatchesValue('20.4% over 568 rasters', '20.4%'), true);
  assert.equal(headlineMatchesValue('19.5% over 568 rasters', '20%'), true);
  assert.equal(headlineMatchesValue('203', '204'), false);
  assert.equal(headlineMatchesValue('20.4% over 568 rasters', '25'), false);
  assert.equal(headlineMatchesValue('20.4% over 568 rasters', '21%'), false);
  // A partial match on the leading number token must never pass: these are digits within the full
  // value's number or an unrelated digit, not the number itself.
  assert.equal(headlineMatchesValue('4,570 of 10,000 targets', '4'), false);
  assert.equal(headlineMatchesValue('4,570 of 10,000 targets', '57'), false);
  assert.equal(headlineMatchesValue('100 each', '0'), false);
});

test('a Metric headline must be derivable from its full value', () => {
  const metric = {
    label: 'Raster bytes saved', value: '20.4% over 568 rasters', measuredAt: '2026-11-08',
    source: { label: 'favseed README' },
  };
  assert.equal(metricSchema.parse({ ...metric, headline: { value: '20%', label: 'fewer favicon bytes than a fixed-quality encode' } }).headline?.value, '20%');
  assert.throws(() => metricSchema.parse({ ...metric, headline: { value: '21%', label: 'fewer favicon bytes than a fixed-quality encode' } }));
  assert.deepEqual(metricSchema.parse(metric).headline, undefined);
});

test('work rejects unknown keys, so a typo never vanishes silently', () => {
  assert.throws(() => workSchema.parse({ ...work, higlights: [] }));
});

test('work repo must be a cevdetch repository and site must be https', () => {
  assert.throws(() => workSchema.parse({ ...work, repo: 'someone/deadhead' }));
  assert.throws(() => workSchema.parse({ ...work, site: 'http://deadhead.cevdet.ch/' }));
});

test('a Translation holds only Story fields', () => {
  assert.deepEqual(workTranslationSchema.parse({ tagline: 'Un linter du head HTML' }), { tagline: 'Un linter du head HTML' });
  assert.throws(() => workTranslationSchema.parse({ tagline: 'x', repo: 'cevdetch/deadhead' }));
  assert.throws(() => workTranslationSchema.parse({ stack: ['typescript'] }));
});

test('tech categories form a closed list; app is never a skill', () => {
  assert.equal(techCategories.app.skills, false);
  assert.throws(() => techSchema.parse({ id: 'x', label: 'X', category: 'misc', url: 'https://x.test/' }));
  assert.throws(() => techSchema.parse({ id: 'Type Script', label: 'TS', category: 'language', url: 'https://x.test/' }));
});

test('profile pins the public identity and carries no location field', () => {
  const profile = {
    name: 'Cevdet', familyName: 'Haran', handle: 'cevdetch', jobTitle: 'Software Developer',
    headline: 'Builds fast sites.', specialisation: 'Web performance · Developer tooling · Open source', country: 'Switzerland',
    bio: 'Builds and publishes developer tools.', proof: 'Creator of deadhead. HTML-head fixes merged into Astro.', proofWorks: ['deadhead'],
    homeMetrics: [{ work: 'deadhead', label: 'Sourced rules' }],
    email: 'hello@cevdet.ch', website: 'https://cevdet.ch/', contactSubject: 'Enquiry from cevdet.ch', writing: 'one',
    socials: [{ network: 'github', url: 'https://github.com/cevdetch' }],
    availability: { capacity: 'part-time', timeZone: 'Europe/Zurich', openTo: ['employment'], workplace: ['remote'] },
    process: [
      { title: 'Reply', detail: 'Reply by email with a first take.' },
      { title: 'Scope', detail: 'Scope the work and agree an estimate in writing.' },
      { title: 'Build', detail: 'Build with checks the client can verify.' },
    ],
    services: [{ id: 'static-sites', name: 'Fast static sites', summary: 'Astro sites.' }],
    languages: [{ name: 'English', level: 'C1' }],
  };
  assert.equal(profileSchema.parse(profile).name, 'Cevdet');
  assert.equal(profileSchema.parse(profile).familyName, 'Haran');
  assert.throws(() => profileSchema.parse({ ...profile, name: 'Cevdet Someone' }));
  assert.throws(() => profileSchema.parse({ ...profile, familyName: 'Someone' }));
  assert.throws(() => profileSchema.parse({ ...profile, location: 'Exampleville' }));
  assert.throws(() => profileSchema.parse({ ...profile, availability: { ...profile.availability, timeZone: 'Mars/Olympus' } }));
  assert.throws(() => profileSchema.parse({ ...profile, availability: { ...profile.availability, hours: 'after 17:00' } }));
  assert.throws(() => profileSchema.parse({ ...profile, country: undefined }));
});

test('availability may state a weekly capacity as a whole number of hours, and nothing finer', () => {
  const profile = profileSchema.parse({
    name: 'Cevdet', familyName: 'Haran', handle: 'cevdetch', jobTitle: 'Software Developer', headline: 'Builds fast sites.',
    specialisation: 'Web performance', country: 'Switzerland', bio: 'Builds tools.', proof: 'Creator of deadhead.', proofWorks: ['deadhead'],
    homeMetrics: [{ work: 'deadhead', label: 'Sourced rules' }],
    email: 'hello@cevdet.ch', website: 'https://cevdet.ch/', contactSubject: 'Enquiry', writing: 'one',
    socials: [{ network: 'github', url: 'https://github.com/cevdetch' }],
    availability: { capacity: 'part-time', timeZone: 'Europe/Zurich', openTo: ['employment'], workplace: ['remote'], hoursPerWeek: 20 },
    process: [{ title: 'Reply', detail: 'Reply.' }, { title: 'Scope', detail: 'Scope.' }, { title: 'Build', detail: 'Build.' }],
    services: [{ id: 'static-sites', name: 'Fast static sites', summary: 'Astro sites.' }],
    languages: [{ name: 'English', level: 'C1' }],
  });
  assert.equal(profile.availability.hoursPerWeek, 20);
  for (const hoursPerWeek of [0, -5, 12.5, '20']) {
    assert.throws(() => profileSchema.parse({ ...profile, availability: { ...profile.availability, hoursPerWeek } }));
  }
  const { hoursPerWeek: _, ...withoutHours } = profile.availability;
  assert.equal(profileSchema.parse({ ...profile, availability: withoutHours }).availability.hoursPerWeek, undefined);
});

test('the home proof line stretches to a full sentence of real, sourced claims', () => {
  const profile = {
    name: 'Cevdet', familyName: 'Haran', handle: 'cevdetch', jobTitle: 'Software Developer',
    headline: 'Builds fast sites.', specialisation: 'Web performance', country: 'Switzerland',
    bio: 'Builds and publishes developer tools.', proofWorks: ['deadhead'],
    homeMetrics: [{ work: 'deadhead', label: 'Sourced rules' }],
    email: 'hello@cevdet.ch', website: 'https://cevdet.ch/', contactSubject: 'Enquiry from cevdet.ch', writing: 'one',
    socials: [{ network: 'github', url: 'https://github.com/cevdetch' }],
    availability: { capacity: 'part-time', timeZone: 'Europe/Zurich', openTo: ['employment'], workplace: ['remote'] },
    process: [
      { title: 'Reply', detail: 'Reply by email with a first take.' },
      { title: 'Scope', detail: 'Scope the work and agree an estimate in writing.' },
      { title: 'Build', detail: 'Build with checks the client can verify.' },
    ],
    services: [{ id: 'static-sites', name: 'Fast static sites', summary: 'Astro sites.' }],
    languages: [{ name: 'English', level: 'C1' }],
  };
  assert.equal(profileSchema.parse({ ...profile, proof: 'x'.repeat(170) }).proof.length, 170);
  assert.throws(() => profileSchema.parse({ ...profile, proof: 'x'.repeat(171) }));
});

test('every interest says whether the CV prints it', () => {
  const profile = profileSchema.parse({
    name: 'Cevdet', familyName: 'Haran', handle: 'cevdetch', jobTitle: 'Software Developer', headline: 'Builds fast sites.',
    specialisation: 'Web performance', country: 'Switzerland', bio: 'Builds tools.', proof: 'Creator of deadhead.', proofWorks: ['deadhead'],
    homeMetrics: [{ work: 'deadhead', label: 'Sourced rules' }],
    email: 'hello@cevdet.ch',
    website: 'https://cevdet.ch/', contactSubject: 'Enquiry', writing: 'one', socials: [{ network: 'github', url: 'https://github.com/cevdetch' }],
    availability: { capacity: 'part-time', timeZone: 'Europe/Zurich', openTo: ['employment'], workplace: ['remote'] },
    process: [
      { title: 'Reply', detail: 'Reply by email with a first take.' },
      { title: 'Scope', detail: 'Scope the work and agree an estimate in writing.' },
      { title: 'Build', detail: 'Build with checks the client can verify.' },
    ],
    services: [{ id: 'static-sites', name: 'Fast static sites', summary: 'Astro sites.' }], languages: [{ name: 'English', level: 'C1' }],
    interests: [{ label: 'Writing', details: 'Essays, published at one.cevdet.ch', cv: true, work: 'one' }],
  });
  assert.deepEqual(profile.interests, [{ label: 'Writing', details: 'Essays, published at one.cevdet.ch', cv: true, work: 'one' }]);
  assert.throws(() => profileSchema.parse({ ...profile, interests: [{ label: 'Writing', details: 'Essays' }] }));
});

test('cv entries print unless marked optional, and need at least one Work or Tech', () => {
  const cv = cvSchema.parse({ projects: [{ works: ['deadhead'] }], skills: [{ label: 'Languages', items: [{ techs: ['typescript'] }] }] });
  assert.equal(cv.projects[0]!.optional, false);
  assert.throws(() => cvSchema.parse({ ...cv, projects: [{ works: [] }] }));
  assert.throws(() => cvSchema.parse({ ...cv, skills: [{ label: 'Languages', items: [{ techs: [] }] }] }));
  assert.throws(() => cvSchema.parse({ ...cv, availability: true }));
});

test('education has no location field', () => {
  const entry = { id: 'sismondi', institution: 'Collège Sismondi', credential: 'Maturité gymnasiale', start: '2024-08', end: '2028-06', expected: true };
  assert.equal(educationSchema.parse(entry).institution, 'Collège Sismondi');
  assert.throws(() => educationSchema.parse({ ...entry, location: 'Exampleville' }));
});

test('contribution overrides key pulls by number', () => {
  const parsed = contributionOverridesSchema.parse({ upstreams: [{ repo: 'withastro/astro', order: 1, pulls: { '101': { highlight: true } } }] });
  assert.equal(parsed.upstreams[0]?.pulls['101']?.hidden, false);
  assert.throws(() => contributionOverridesSchema.parse({ upstreams: [{ repo: 'withastro/astro', pulls: { abc: {} } }] }));
});
