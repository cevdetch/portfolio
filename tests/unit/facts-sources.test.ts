import assert from 'node:assert/strict';
import { test } from 'node:test';
import { snapshotSchema } from '../../src/facts/schema.ts';
import { countDiscussion, lastPage, toContribution, toPkgbuilds, toRepoFacts } from '../../src/facts/sources/github.ts';
import { checkSvg, sha256 } from '../../src/facts/sources/icons.ts';
import { toAurFacts, toNpmFacts } from '../../src/facts/sources/registries.ts';
import { fixtureSnapshot } from '../helpers/portfolio-fixture.ts';

const commit = (date: string) => ({ commit: { author: { date } } });

test('the fixture Snapshot and millisecond timestamps parse', () => {
  assert.doesNotThrow(() => snapshotSchema.parse(fixtureSnapshot()));
});

test('lastPage reads the rel="last" page from a Link header', () => {
  const link = '<https://api.github.com/repositories/1/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/commits?per_page=1&page=412>; rel="last"';
  assert.equal(lastPage(link), 412);
  assert.equal(lastPage(null), null);
  assert.equal(lastPage('<https://x.test/?page=2>; rel="next"'), null);
});

test('toRepoFacts maps licence, dates, count and release', () => {
  const facts = toRepoFacts({
    repo: { private: false, default_branch: 'main', license: { spdx_id: 'MIT' } },
    newest: commit('2026-11-01T10:00:00Z'), oldest: commit('2026-09-01T10:00:00Z'), commitCount: 412,
    release: { tag_name: 'v0.3.1', published_at: '2026-10-20T10:00:00Z', draft: false },
  });
  assert.deepEqual(facts, { private: false, license: 'MIT', firstCommit: '2026-09-01T10:00:00Z', lastCommit: '2026-11-01T10:00:00Z', commitCount: 412, latestRelease: { tag: 'v0.3.1', publishedAt: '2026-10-20T10:00:00Z' } });
  const bare = toRepoFacts({ repo: { private: false, default_branch: 'main', license: { spdx_id: 'NOASSERTION' } }, newest: commit('2026-11-01T10:00:00Z'), oldest: commit('2026-11-01T10:00:00Z'), commitCount: 1, release: null });
  assert.equal(bare.license, null);
  assert.equal(bare.latestRelease, null);
});

test('toContribution keeps only what is displayed and rejects unmerged items', () => {
  const item = { html_url: 'https://github.com/withastro/astro/pull/101', number: 101, title: ' Fix sitemap ', repository_url: 'https://api.github.com/repos/withastro/astro', pull_request: { merged_at: '2026-06-24T12:35:44Z' } };
  assert.deepEqual(toContribution(item), { upstream: 'withastro/astro', number: 101, title: 'Fix sitemap', url: 'https://github.com/withastro/astro/pull/101', mergedAt: '2026-06-24T12:35:44Z' });
  assert.throws(() => toContribution({ ...item, pull_request: { merged_at: null } }), /unmerged/);
});

test('countDiscussion counts what other people wrote in review, never the author, bots or a bare approval', () => {
  const by = (login: string, type = 'User', body = 'Looks good, one nit.') => ({ user: { login, type }, body });
  assert.equal(countDiscussion({
    reviews: [by('maintainer'), by('maintainer', 'User', ''), by('maintainer', 'User', '  '), by('cevdetch')],
    reviewComments: [by('maintainer'), by('maintainer'), by('cevdetch'), { user: null, body: 'from a deleted account' }],
    issueComments: [by('reviewer'), by('netlify[bot]'), by('renovate', 'Bot'), by('astrobot-houston'), by('CevdetCH')],
  }, 'cevdetch'), 4);
});

test('toPkgbuilds lists top-level folders holding a PKGBUILD', () => {
  const tree = { truncated: false, tree: [
    { path: 'zed-waypure/PKGBUILD', type: 'blob' as const },
    { path: 'cairo/PKGBUILD', type: 'blob' as const },
    { path: 'cairo/fix.patch', type: 'blob' as const },
    { path: 'docs/sub/PKGBUILD', type: 'blob' as const },
    { path: 'PKGBUILD', type: 'blob' as const },
  ] };
  assert.deepEqual(toPkgbuilds(tree), ['cairo', 'zed-waypure']);
  assert.throws(() => toPkgbuilds({ ...tree, truncated: true }), /truncated/);
});

test('npm: a missing package is a Fact, not an error', () => {
  assert.deepEqual(toNpmFacts('favseed', null), { registry: 'npm', name: 'favseed', published: false });
  assert.deepEqual(toNpmFacts('deadhead', { 'dist-tags': { latest: '0.3.1' }, time: { '0.3.1': '2026-10-20T10:00:00.123Z' } }),
    { registry: 'npm', name: 'deadhead', published: true, version: '0.3.1', releasedAt: '2026-10-20T10:00:00.123Z', url: 'https://www.npmjs.com/package/deadhead' });
});

test('aur: version and last-modified date', () => {
  assert.deepEqual(toAurFacts('zed-waypure', { resultcount: 0, results: [] }), { registry: 'aur', name: 'zed-waypure', published: false });
  assert.deepEqual(toAurFacts('x', { resultcount: 1, results: [{ Name: 'x', Version: '1.0-1', LastModified: 1767225600 }] }),
    { registry: 'aur', name: 'x', published: true, version: '1.0-1', releasedAt: '2026-01-01T00:00:00.000Z', url: 'https://aur.archlinux.org/packages/x' });
});

test('checkSvg accepts a plain icon and rejects active content', async () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0h32v32H0z" fill="#5685AD"/></svg>';
  assert.deepEqual(checkSvg(ok), []);
  assert.deepEqual(checkSvg('<svg><script>alert(1)</script></svg>'), ['script element']);
  assert.deepEqual(checkSvg('<svg xmlns:x="http://www.w3.org/2000/svg"><x:script>alert(1)</x:script></svg>'), ['script element']);
  assert.deepEqual(checkSvg('<svg><svg:foreignObject><p>hi</p></svg:foreignObject></svg>'), ['foreignObject element']);
  assert.deepEqual(checkSvg('<svg onload="x()"></svg>'), ['event handler attribute']);
  assert.deepEqual(checkSvg('<svg><image href="https://x.test/a.png"/></svg>'), ['external reference']);
  assert.deepEqual(checkSvg('<svg><use href="#a"/></svg>'), []);
  assert.deepEqual(checkSvg('<!doctype html><html></html>'), ['not an SVG document']);
  assert.match(await sha256('abc'), /^ba7816bf/);
});
