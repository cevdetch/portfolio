import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';
import { portraitUrl } from '../../src/data/portrait.ts';
import { fullName } from '../../src/data/profile.ts';
import {
  breadcrumbNode, graph, personNode, profilePageNode, serializeJsonLd, websiteNode, workCrumbs, workNode,
} from '../../src/lib/jsonld.ts';
import { identity } from '../../src/lib/structured-data.ts';
import { profileSchema } from '../../src/schemas/profile.ts';
import { fixturePortfolio, fixtureSnapshot } from '../helpers/portfolio-fixture.ts';

/** One field of a node, whatever its schema.org type. */
const field = (node: object, key: string): unknown => (node as Record<string, unknown>)[key];
const owner = { '@type': 'Person', '@id': 'https://cevdet.ch/#person', name: 'Cevdet Haran', url: 'https://cevdet.ch/' };

test('profile.yaml names the person exactly as the shared identity does', async () => {
  const profile = profileSchema.parse(parse(await readFile(new URL('../../src/content/profile.yaml', import.meta.url), 'utf8')));
  assert.equal(fullName(profile), identity.name);
  assert.equal(profile.name, identity.givenName);
  assert.equal(profile.familyName, identity.familyName);
  assert.deepEqual([profile.name, profile.handle], identity.alternateName);
  assert.equal(profile.website, identity.url);
  assert.deepEqual(profile.socials.map(social => social.url), identity.sameAs);
  assert.equal(portraitUrl(profile.website), identity.image);
});

test('the @ids One already references stay stable', () => {
  const { profile, techs } = fixturePortfolio();
  assert.equal(personNode(profile, techs)['@id'], 'https://cevdet.ch/#person');
  assert.equal(websiteNode(profile)['@id'], 'https://cevdet.ch/#website');
  assert.deepEqual(profilePageNode(profile), {
    '@type': 'ProfilePage', '@id': 'https://cevdet.ch/#profile', url: 'https://cevdet.ch/',
    name: 'Cevdet Haran - Software Developer', isPartOf: { '@id': 'https://cevdet.ch/#website' }, mainEntity: { '@id': 'https://cevdet.ch/#person' },
  });
});

test('the home WebSite takes the full name as its site name and credits the person by name', () => {
  const { profile } = fixturePortfolio();
  assert.deepEqual(websiteNode(profile), {
    '@type': 'WebSite', '@id': 'https://cevdet.ch/#website', url: 'https://cevdet.ch/', name: 'Cevdet Haran',
    alternateName: 'cevdet.ch', inLanguage: 'en', publisher: owner,
  });
});

test('the Person is the shared identity plus the facts the home page shows', () => {
  const { profile, techs } = fixturePortfolio();
  assert.deepEqual(personNode(profile, techs), {
    '@type': 'Person', '@id': 'https://cevdet.ch/#person', name: 'Cevdet Haran', givenName: 'Cevdet', familyName: 'Haran',
    alternateName: ['Cevdet', 'cevdetch'], url: 'https://cevdet.ch/',
    sameAs: ['https://github.com/cevdetch', 'https://www.linkedin.com/in/cevdetch/', 'https://www.npmjs.com/~cevdetch'],
    jobTitle: 'Software Developer', description: 'Builds and publishes open-source developer tools.', email: 'mailto:hello@cevdet.ch',
    knowsAbout: ['TypeScript', 'Astro', 'Sway'],
  });
});

test('knowsAbout comes from the registry and excludes apps', () => {
  const { profile, techs } = fixturePortfolio();
  assert.deepEqual(personNode(profile, techs)['knowsAbout'], ['TypeScript', 'Astro', 'Sway']);
});

test('with a portrait, the Person image is an ImageObject at the stable URL, captioned with the full name', () => {
  const { profile, techs } = fixturePortfolio();
  assert.equal(personNode(profile, techs)['image'], undefined);
  assert.deepEqual(personNode(profile, techs, { width: 1200, height: 1200 })['image'], {
    '@type': 'ImageObject', '@id': 'https://cevdet.ch/#portrait',
    url: 'https://cevdet.ch/cevdet-haran.jpg', contentUrl: 'https://cevdet.ch/cevdet-haran.jpg',
    width: '1200', height: '1200', caption: 'Cevdet Haran',
  });
});

test('a package Work is SoftwareSourceCode with Facts, described by its Work page', () => {
  const { works, techs } = fixturePortfolio();
  assert.deepEqual(workNode(works[0]!, fixtureSnapshot().works['deadhead'], techs), {
    '@type': 'SoftwareSourceCode', '@id': 'https://cevdet.ch/work/deadhead/#code',
    url: 'https://cevdet.ch/work/deadhead/', mainEntityOfPage: 'https://cevdet.ch/work/deadhead/',
    name: 'deadhead', description: 'Lints the HTML head against sourced rules.',
    codeRepository: 'https://github.com/cevdetch/deadhead', programmingLanguage: ['TypeScript'],
    license: 'https://spdx.org/licenses/MIT.html', sameAs: ['https://deadhead.cevdet.ch/'], author: owner,
  });
});

test('a site Work is that site\'s own WebSite, under the @id the site gives itself', () => {
  const { works, techs } = fixturePortfolio();
  assert.deepEqual(workNode(works[1]!, fixtureSnapshot().works['one'], techs), {
    '@type': 'WebSite', '@id': 'https://one.cevdet.ch/#website', url: 'https://one.cevdet.ch/', name: 'One',
    description: 'The site that publishes the Writing.', publisher: owner, mainEntityOfPage: 'https://cevdet.ch/work/one/',
  });
});

test('a site Work without a site falls back to SoftwareSourceCode', () => {
  const { works, techs } = fixturePortfolio();
  const siteless = { ...works[1]!, data: { ...works[1]!.data, site: undefined } };
  assert.equal(workNode(siteless, undefined, techs)['@type'], 'SoftwareSourceCode');
});

test('a private repository is never named as the codeRepository', () => {
  const { works, techs } = fixturePortfolio();
  const privateTool = works.find(work => work.id === 'private-tool')!;
  assert.equal(field(workNode(privateTool, fixtureSnapshot().works['private-tool'], techs), 'codeRepository'), undefined);
  assert.equal(field(workNode(works[0]!, undefined, techs), 'codeRepository'), undefined);
  assert.equal(field(workNode(works[0]!, undefined, techs), 'license'), undefined);
});

test('a Work without a site does not have sameAs', () => {
  const { works, techs } = fixturePortfolio();
  const siteless = { ...works[0]!, data: { ...works[0]!.data, site: undefined } };
  assert.equal(field(workNode(siteless, undefined, techs), 'sameAs'), undefined);
});

test('the breadcrumb trail runs Home, Work, the Work, and the BreadcrumbList follows it', () => {
  const { works } = fixturePortfolio();
  assert.deepEqual(workCrumbs(works[0]!), [
    { name: 'Home', path: '/' }, { name: 'Work', path: '/work/' }, { name: 'deadhead', path: '/work/deadhead/' },
  ]);
  assert.deepEqual(breadcrumbNode(works[0]!), {
    '@type': 'BreadcrumbList', '@id': 'https://cevdet.ch/work/deadhead/#breadcrumb',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://cevdet.ch/' },
      { '@type': 'ListItem', position: 2, name: 'Work', item: 'https://cevdet.ch/work/' },
      { '@type': 'ListItem', position: 3, name: 'deadhead' },
    ],
  });
});

test('serialisation cannot close the script element', () => {
  assert.equal(serializeJsonLd(graph({ '@type': 'Thing', name: '</script>' })),
    '{"@context":"https://schema.org","@graph":[{"@type":"Thing","name":"\\u003c/script>"}]}');
});
