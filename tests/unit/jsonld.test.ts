import assert from 'node:assert/strict';
import { test } from 'node:test';
import { graph, personNode, profilePageNode, serializeJsonLd, websiteNode, workNode } from '../../src/lib/jsonld.ts';
import { fixturePortfolio, fixtureSnapshot } from '../helpers/portfolio-fixture.ts';

test('the @ids One already references stay stable', () => {
  const { profile, techs } = fixturePortfolio();
  assert.equal(personNode(profile, techs)['@id'], 'https://cevdet.ch/#person');
  assert.equal(websiteNode(profile)['@id'], 'https://cevdet.ch/#website');
  assert.deepEqual(profilePageNode(profile), {
    '@type': 'ProfilePage', '@id': 'https://cevdet.ch/#profile', url: 'https://cevdet.ch/',
    name: 'Cevdet - Software Developer', isPartOf: { '@id': 'https://cevdet.ch/#website' }, mainEntity: { '@id': 'https://cevdet.ch/#person' },
  });
});

test('knowsAbout comes from the registry and excludes apps', () => {
  const { profile, techs } = fixturePortfolio();
  assert.deepEqual(personNode(profile, techs)['knowsAbout'], ['TypeScript', 'Astro', 'Sway']);
});

test('a package Work is SoftwareSourceCode with Facts; a site Work is a WebSite', () => {
  const { works, techs } = fixturePortfolio();
  const facts = fixtureSnapshot();
  assert.deepEqual(workNode(works[0]!, facts.works['deadhead'], techs), {
    '@type': 'SoftwareSourceCode', '@id': 'https://cevdet.ch/work/deadhead/#work',
    name: 'deadhead', description: 'Lints the HTML head against sourced rules.',
    url: 'https://deadhead.cevdet.ch/', mainEntityOfPage: 'https://cevdet.ch/work/deadhead/',
    author: { '@id': 'https://cevdet.ch/#person' },
    sameAs: ['https://deadhead.cevdet.ch/'],
    codeRepository: 'https://github.com/cevdetch/deadhead',
    license: 'https://spdx.org/licenses/MIT.html', programmingLanguage: ['TypeScript'],
  });
  assert.equal(workNode(works[1]!, facts.works['one'], techs)['@type'], 'WebSite');
});

test('serialisation cannot close the script element', () => {
  assert.equal(serializeJsonLd(graph([{ name: '</script>' }])), '{"@context":"https://schema.org","@graph":[{"name":"\\u003c/script>"}]}');
});

test('a Work without a site does not have sameAs', () => {
  const { works, techs } = fixturePortfolio();
  const siteless = { ...works[0]!, data: { ...works[0]!.data, site: undefined } };
  assert.equal(workNode(siteless, undefined, techs)['sameAs'], undefined);
});
