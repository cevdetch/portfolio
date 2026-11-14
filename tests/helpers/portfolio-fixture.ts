import type { Portfolio } from '../../src/data/validate.ts';
import type { Snapshot } from '../../src/facts/schema.ts';
import { educationSchema, experienceSchema } from '../../src/schemas/background.ts';
import { contributionOverridesSchema } from '../../src/schemas/contributions.ts';
import { cvSchema } from '../../src/schemas/cv.ts';
import { profileSchema } from '../../src/schemas/profile.ts';
import { techSchema } from '../../src/schemas/tech.ts';
import { usesSectionSchema } from '../../src/schemas/uses.ts';
import { workSchema } from '../../src/schemas/work.ts';

export const caseStudyBody = '## Problem\n\nA.\n\n## Constraints\n\nB.\n\n## Decisions\n\nC.\n\n## Results\n\nD.\n\n## Next\n\nE.\n';

export function fixturePortfolio(): Portfolio {
  return {
    profile: profileSchema.parse({
      name: 'Cevdet', familyName: 'Haran', handle: 'cevdetch', jobTitle: 'Software Developer',
      headline: 'Software developer who ships fast sites and developer tools.',
      specialisation: 'Web performance · Developer tooling · Open source', country: 'Switzerland',
      bio: 'Builds and publishes open-source developer tools.',
      proof: 'Creator of deadhead. HTML-head fixes merged into Astro.', proofWorks: ['deadhead'],
      homeMetrics: [{ work: 'deadhead', label: 'Sourced rules' }],
      email: 'hello@cevdet.ch', website: 'https://cevdet.ch/', contactSubject: 'Enquiry from cevdet.ch', writing: 'one',
      socials: [{ network: 'github', url: 'https://github.com/cevdetch' }, { network: 'linkedin', url: 'https://www.linkedin.com/in/cevdetch/' }],
      availability: { capacity: 'part-time', timeZone: 'Europe/Zurich', openTo: ['employment', 'contract', 'freelance'], workplace: ['remote', 'local'] },
      process: [
        { title: 'Reply', detail: 'Reply by email with a first take.' },
        { title: 'Scope', detail: 'Scope the work and agree an estimate in writing.' },
        { title: 'Build', detail: 'Build with checks the client can verify.' },
      ],
      services: [{ id: 'static-sites', name: 'Fast static sites', summary: 'Astro sites.', evidence: ['deadhead'] }],
      languages: [{ name: 'Turkish', level: 'native' }, { name: 'Kurdish', level: 'native' }, { name: 'English', level: 'C1' }, { name: 'French', level: 'C1' }, { name: 'German', level: 'B1' }],
      interests: [
        { label: 'Writing', details: 'Philosophical essays, published at one.cevdet.ch', cv: true, work: 'one' },
        { label: 'Pursuits', details: 'Bouldering, hiking', cv: false },
      ],
    }),
    techs: [
      { id: 'typescript', label: 'TypeScript', category: 'language', url: 'https://www.typescriptlang.org/' },
      { id: 'astro', label: 'Astro', category: 'framework', url: 'https://astro.build/' },
      { id: 'sway', label: 'Sway', category: 'desktop', url: 'https://swaywm.org/' },
      { id: 'molly', label: 'Molly', category: 'app', url: 'https://molly.im/' },
    ].map(tech => techSchema.parse(tech)),
    works: [
      { id: 'deadhead', body: caseStudyBody, data: workSchema.parse({
        title: 'deadhead', kind: 'package', status: 'maintained', featured: true, order: 1,
        repo: 'cevdetch/deadhead', site: 'https://deadhead.cevdet.ch/', packages: [{ registry: 'npm', name: 'deadhead' }],
        stack: ['typescript'], tagline: 'An HTML head linter', summary: 'Lints the HTML head against sourced rules.',
        role: 'Creator and maintainer', highlights: ['Generates the linter and its documentation from the same Markdown.'],
        metrics: [{ label: 'Sourced rules', value: '203', measuredAt: '2026-10-26', source: { label: 'deadhead release notes', url: 'https://github.com/cevdetch/deadhead/releases/tag/v0.3.1' } }],
      }) },
      { id: 'one', body: caseStudyBody, data: workSchema.parse({
        title: 'One', kind: 'site', status: 'active', site: 'https://one.cevdet.ch/', stack: ['astro'],
        tagline: 'An author site for essays and poems', summary: 'The site that publishes the Writing.', role: 'Author and developer', highlights: [],
      }) },
      { id: 'astro-minimal-template', body: caseStudyBody, data: workSchema.parse({
        title: 'Astro Minimal Template', kind: 'template', status: 'maintained', repo: 'cevdetch/astro-minimal-template', stack: ['astro'],
        tagline: 'An Astro starter', summary: 'Starts an Astro site.', role: 'Creator and maintainer', highlights: ['Ships no client JavaScript.'],
        cvLine: 'strictest TypeScript, with no client JavaScript.',
      }) },
      { id: 'arch-waypure', body: caseStudyBody, data: workSchema.parse({
        title: 'arch-waypure', kind: 'infrastructure', status: 'active', repo: 'cevdetch/arch-waypure', pkgbuilds: true, stack: ['astro'],
        tagline: 'Arch Linux PKGBUILDs', summary: 'Packages a Wayland-only desktop.', role: 'Creator and maintainer', highlights: [],
        cvLine: '{pkgbuilds} PKGBUILDs with Python audit tools.',
      }) },
      { id: 'private-tool', body: caseStudyBody, data: workSchema.parse({
        title: 'Private tool', kind: 'infrastructure', status: 'active', repo: 'cevdetch/private-tool', stack: ['astro'],
        tagline: 'Self-hosted services', summary: 'Runs self-hosted services.', role: 'Designer and operator', highlights: [],
        cvLine: 'self-hosted services with no public ports.',
      }) },
    ],
    experience: [experienceSchema.parse({ id: 'starlane', organisation: 'Starlane', role: 'Freelance Web Developer', engagement: 'freelance', workplace: 'remote', start: '2022-03', end: '2022-05', highlights: ['Built three sites.'], stack: ['astro'] })],
    education: [educationSchema.parse({ id: 'sismondi', institution: 'Collège Sismondi', credential: 'Maturité gymnasiale', field: 'Physics and Applied Mathematics', start: '2024-08', end: '2028-06', expected: true })],
    uses: [{ id: 'phone', data: usesSectionSchema.parse({ title: 'Phone', order: 1, entries: [{ tech: 'molly' }] }) }],
    contributions: contributionOverridesSchema.parse({
      upstreams: [
        { repo: 'withastro/astro', order: 1, label: 'Astro', techs: ['astro'], pulls: { '101': { highlight: true, note: 'Fixed a sitemap edge case.' } } },
        { repo: 'sveltejs/svelte', label: 'Svelte' },
      ],
      themes: [{
        id: 'head-metadata', lead: 'HTML-head fixes merged into', note: 'including a sitemap_index fix in Astro',
        upstreams: ['withastro/astro', 'sveltejs/svelte'],
      }],
    }),
    cv: cvSchema.parse({
      projects: [
        { works: ['deadhead'] },
        { title: 'Astro templates', works: ['astro-minimal-template'] },
        { title: 'Linux & infrastructure', works: ['arch-waypure', 'private-tool'], optional: true },
      ],
      skills: [
        { label: 'Languages', items: [{ techs: ['typescript'] }] },
        { label: 'Desktop', items: [{ techs: ['sway', 'molly'], display: 'Sway_and Molly' }, { techs: ['astro'] }] },
      ],
    }),
  };
}

export function fixtureSnapshot(): Snapshot {
  return {
    version: 1,
    refreshedAt: '2026-11-09T06:00:00.000Z',
    works: {
      deadhead: {
        repo: { private: false, license: 'MIT', firstCommit: '2026-09-01T10:00:00Z', lastCommit: '2026-11-01T10:00:00Z', commitCount: 412, latestRelease: { tag: 'v0.3.1', publishedAt: '2026-10-20T10:00:00Z' } },
        packages: [{ registry: 'npm', name: 'deadhead', published: true, version: '0.3.1', releasedAt: '2026-10-20T10:00:00.000Z', url: 'https://www.npmjs.com/package/deadhead' }],
        icon: { file: 'icons/deadhead.svg', sha256: 'a'.repeat(64) },
        lighthouse: { performance: 98, accessibility: 100, bestPractices: 100, seo: 100, measuredAt: '2026-11-07T05:20:00.000Z' },
      },
      one: { packages: [], icon: null, lighthouse: { performance: 100, accessibility: 100, bestPractices: 96, seo: 100, measuredAt: '2026-11-07T05:21:00.000Z' } },
      'astro-minimal-template': {
        repo: { private: false, license: 'MIT', firstCommit: '2026-10-24T21:25:18Z', lastCommit: '2026-10-28T22:02:50Z', commitCount: 40, latestRelease: null },
        packages: [],
      },
      'arch-waypure': {
        repo: { private: false, license: null, firstCommit: '2025-12-24T22:35:44Z', lastCommit: '2026-11-06T18:07:27Z', commitCount: 90, latestRelease: null },
        packages: [], pkgbuilds: ['mpv', 'sway', 'wlroots'],
      },
      'private-tool': { repo: { private: true }, packages: [] },
    },
    contributions: [
      { upstream: 'withastro/astro', number: 102, title: 'Handle base in sitemap', url: 'https://github.com/withastro/astro/pull/102', mergedAt: '2026-07-01T08:22:12Z' },
      { upstream: 'sveltejs/svelte', number: 7, title: 'Fix a typo', url: 'https://github.com/sveltejs/svelte/pull/7', mergedAt: '2026-06-30T10:00:00Z' },
      { upstream: 'withastro/astro', number: 101, title: 'Fix sitemap trailing slash', url: 'https://github.com/withastro/astro/pull/101', mergedAt: '2026-06-24T12:35:44Z' },
    ],
  };
}
