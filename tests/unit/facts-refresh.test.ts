import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createClient, type Client } from '../../src/facts/client.ts';
import { collectFacts, highlightedPulls } from '../../src/facts/refresh.ts';
import { publicRepo, type LighthouseFacts, type Snapshot } from '../../src/facts/schema.ts';
import { contributionOverridesSchema } from '../../src/schemas/contributions.ts';
import { readWorkSources } from '../../scripts/fetch-facts.ts';

type Route = { data?: unknown; link?: string; body?: string; contentType?: string } | null;

function fakeClient(routes: Record<string, Route>): Client & { requested: string[] } {
  const requested: string[] = [];
  const hit = (url: string): Route => {
    requested.push(url);
    if (!(url in routes)) throw new Error(`unexpected request ${url}`);
    return routes[url]!;
  };
  return {
    requested,
    async json<T>(url: string) {
      const route = hit(url);
      return route ? { data: route.data as T, headers: new Headers(route.link ? { link: route.link } : {}) } : null;
    },
    async text(url: string) {
      const route = hit(url);
      return route ? { body: route.body ?? '', contentType: route.contentType ?? 'image/svg+xml' } : null;
    },
  };
}

const api = 'https://api.github.com';
const search = `${api}/search/issues?q=${encodeURIComponent('is:pr is:merged is:public author:cevdetch -user:cevdetch')}&per_page=100&page=1`;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';

test('collectFacts reads every source for a Work and the Contributions', async () => {
  const client = fakeClient({
    [`${api}/repos/cevdetch/deadhead`]: { data: { private: false, default_branch: 'main', license: { spdx_id: 'MIT' } } },
    [`${api}/repos/cevdetch/deadhead/commits?sha=main&per_page=1`]: { data: [{ commit: { author: { date: '2026-11-01T10:00:00Z' } } }], link: `<${api}/repositories/1/commits?per_page=1&page=412>; rel="last"` },
    [`${api}/repos/cevdetch/deadhead/commits?sha=main&per_page=1&page=412`]: { data: [{ commit: { author: { date: '2026-09-01T10:00:00Z' } } }] },
    [`${api}/repos/cevdetch/deadhead/releases/latest`]: { data: { tag_name: 'v0.3.1', published_at: '2026-10-20T10:00:00Z', draft: false } },
    'https://registry.npmjs.org/deadhead': { data: { 'dist-tags': { latest: '0.3.1' }, time: { '0.3.1': '2026-10-20T10:00:00.000Z' } } },
    'https://registry.npmjs.org/favseed': null,
    'https://deadhead.cevdet.ch/icon.svg': { body: svg },
    'https://astro-metadata-lab.cevdet.ch/icon.svg': null,
    [search]: { data: { total_count: 1, items: [{ html_url: 'https://github.com/withastro/astro/pull/101', number: 101, title: 'Fix', repository_url: `${api}/repos/withastro/astro`, pull_request: { merged_at: '2026-06-24T12:35:44Z' } }] } },
  });
  const collected = await collectFacts([
    { id: 'deadhead', repo: 'cevdetch/deadhead', site: 'https://deadhead.cevdet.ch/', packages: [{ registry: 'npm', name: 'deadhead' }, { registry: 'npm', name: 'favseed' }], pkgbuilds: false },
    { id: 'astro-metadata-lab', site: 'https://astro-metadata-lab.cevdet.ch/', packages: [], pkgbuilds: false },
    { id: 'private-tool', packages: [], pkgbuilds: false },
  ], client);
  assert.equal(publicRepo(collected.works['deadhead'])?.commitCount, 412);
  assert.equal(publicRepo(collected.works['deadhead'])?.firstCommit, '2026-09-01T10:00:00Z');
  assert.deepEqual(collected.works['deadhead']?.packages.map(p => p.published), [true, false]);
  assert.equal(collected.works['deadhead']?.icon?.file, 'icons/deadhead.svg');
  assert.equal(collected.works['astro-metadata-lab']?.icon, null);
  assert.equal('private-tool' in collected.works, false);
  assert.deepEqual(collected.icons, [{ workId: 'deadhead', svg }]);
  assert.equal(collected.contributions.length, 1);
});

test('collectFacts records the review discussion of highlighted pulls only, across pages', async () => {
  const pr = (n: number) => ({ html_url: `https://github.com/withastro/astro/pull/${n}`, number: n, title: 'Fix', repository_url: `${api}/repos/withastro/astro`, pull_request: { merged_at: '2026-06-24T12:35:44Z' } });
  const comment = (login: string, created_at = '2026-06-20T10:00:00Z') => ({ user: { login, type: 'User' }, body: 'Please rename this.', created_at });
  const client = fakeClient({
    [search]: { data: { total_count: 2, items: [pr(101), pr(102)] } },
    [`${api}/repos/withastro/astro/pulls/101/reviews?per_page=100&page=1`]: { data: [{ user: { login: 'maintainer', type: 'User' }, body: 'One nit.', submitted_at: '2026-06-20T10:00:00Z' }] },
    [`${api}/repos/withastro/astro/pulls/101/comments?per_page=100&page=1`]: { data: Array.from({ length: 100 }, () => comment('maintainer')) },
    [`${api}/repos/withastro/astro/pulls/101/comments?per_page=100&page=2`]: { data: [comment('maintainer'), comment('cevdetch')] },
    [`${api}/repos/withastro/astro/issues/101/comments?per_page=100&page=1`]: { data: [comment('netlify[bot]'), comment('reporter', '2026-07-01T10:00:00Z')] },
  });
  const collected = await collectFacts([], client, { highlights: ['withastro/astro#101'] });
  assert.deepEqual(collected.contributions.map(c => [c.number, c.discussion]), [[101, { comments: 102 }], [102, undefined]]);
});

test('highlightedPulls names the pinned pulls as repo#number', () => {
  const overrides = contributionOverridesSchema.parse({ upstreams: [
    { repo: 'withastro/astro', pulls: { '101': { highlight: true }, '102': { note: 'A note.' } } },
    { repo: 'sveltejs/svelte', pulls: { '7': { highlight: true } } },
  ] });
  assert.deepEqual(highlightedPulls(overrides), ['withastro/astro#101', 'sveltejs/svelte#7']);
});

test('a single-commit repository needs no second page', async () => {
  const client = fakeClient({
    [`${api}/repos/cevdetch/x`]: { data: { private: false, default_branch: 'main', license: null } },
    [`${api}/repos/cevdetch/x/commits?sha=main&per_page=1`]: { data: [{ commit: { author: { date: '2026-11-01T10:00:00Z' } } }] },
    [`${api}/repos/cevdetch/x/releases/latest`]: null,
    [search]: { data: { total_count: 0, items: [] } },
  });
  const collected = await collectFacts([{ id: 'x', repo: 'cevdetch/x', packages: [], pkgbuilds: false }], client);
  assert.equal(publicRepo(collected.works['x'])?.commitCount, 1);
  assert.equal(publicRepo(collected.works['x'])?.firstCommit, '2026-11-01T10:00:00Z');
});

test('a Work with rules counts them from its rule files at the latest release', async () => {
  const blob = (scope: string) => ({ data: { encoding: 'base64', content: Buffer.from(`---\nscope: "${scope}"\n---\n`).toString('base64') } });
  const client = fakeClient({
    [`${api}/repos/cevdetch/x`]: { data: { private: false, default_branch: 'main', license: null } },
    [`${api}/repos/cevdetch/x/commits?sha=main&per_page=1`]: { data: [{ commit: { author: { date: '2026-11-01T10:00:00Z' } } }] },
    [`${api}/repos/cevdetch/x/releases/latest`]: { data: { tag_name: 'v0.3.1', published_at: '2026-10-20T10:00:00Z', draft: false } },
    [`${api}/repos/cevdetch/x/git/trees/v0.3.1?recursive=1`]: { data: { truncated: false, tree: [
      { path: 'content/rules/head/a.md', type: 'blob', sha: 'a1' },
      { path: 'content/rules/element/b.md', type: 'blob', sha: 'b2' },
    ] } },
    [`${api}/repos/cevdetch/x/git/blobs/a1`]: blob('head'),
    [`${api}/repos/cevdetch/x/git/blobs/b2`]: blob('body'),
    [search]: { data: { total_count: 0, items: [] } },
  });
  const collected = await collectFacts([{ id: 'x', repo: 'cevdetch/x', packages: [], pkgbuilds: false, rules: true }], client);
  assert.deepEqual(collected.works['x']?.rules, { total: 2, head: 1 });
});

test('rule counts carry over while the latest release tag is unchanged', async () => {
  const client = fakeClient({
    [`${api}/repos/cevdetch/x`]: { data: { private: false, default_branch: 'main', license: null } },
    [`${api}/repos/cevdetch/x/commits?sha=main&per_page=1`]: { data: [{ commit: { author: { date: '2026-11-01T10:00:00Z' } } }] },
    [`${api}/repos/cevdetch/x/releases/latest`]: { data: { tag_name: 'v0.3.1', published_at: '2026-10-20T10:00:00Z', draft: false } },
    [search]: { data: { total_count: 0, items: [] } },
  });
  const repo = { private: false as const, license: null, firstCommit: '2026-11-01T10:00:00Z', lastCommit: '2026-11-01T10:00:00Z', commitCount: 1, latestRelease: { tag: 'v0.3.1', publishedAt: '2026-10-20T10:00:00Z' } };
  const previous = { version: 1 as const, refreshedAt: '2026-11-09T06:00:00.000Z', works: { x: { repo, packages: [], rules: { total: 203, head: 92 } } }, contributions: [] };
  const collected = await collectFacts([{ id: 'x', repo: 'cevdetch/x', packages: [], pkgbuilds: false, rules: true }], client, { previous });
  assert.deepEqual(collected.works['x']?.rules, { total: 203, head: 92 });
  assert.ok(!client.requested.some(url => url.includes('/git/')));
});

test('a private repo records only that it is private', async () => {
  const client = fakeClient({
    [`${api}/repos/cevdetch/private-site`]: { data: { private: true, default_branch: 'main', license: null } },
    [search]: { data: { total_count: 0, items: [] } },
  });
  const collected = await collectFacts([{ id: 'private-site', repo: 'cevdetch/private-site', packages: [], pkgbuilds: true }], client);
  assert.deepEqual(collected.works['private-site'], { repo: { private: true }, packages: [] });
  assert.deepEqual(client.requested, [`${api}/repos/cevdetch/private-site`, search]);
});

test('a repo the token cannot see stays private only if the last refresh found it private', async () => {
  const routes = { [`${api}/repos/cevdetch/private-site`]: null, [search]: { data: { total_count: 0, items: [] } } };
  const source = { id: 'private-site', repo: 'cevdetch/private-site', packages: [], pkgbuilds: false };
  const previous = { version: 1 as const, refreshedAt: '2026-11-09T06:00:00.000Z', works: { 'private-site': { repo: { private: true as const }, packages: [] } }, contributions: [] };
  const collected = await collectFacts([source], fakeClient(routes), { previous });
  assert.deepEqual(collected.works['private-site']?.repo, { private: true });
  await assert.rejects(collectFacts([source], fakeClient(routes)), /cevdetch\/private-site: not found/);
});

test('a non-SVG icon or an unsafe icon stops the refresh', async () => {
  await assert.rejects(collectFacts([{ id: 'x', site: 'https://x.cevdet.ch/', packages: [], pkgbuilds: false }], fakeClient({
    'https://x.cevdet.ch/icon.svg': { body: '<html></html>', contentType: 'text/html' },
  })), /not image\/svg\+xml/);
  await assert.rejects(collectFacts([{ id: 'x', site: 'https://x.cevdet.ch/', packages: [], pkgbuilds: false }], fakeClient({
    'https://x.cevdet.ch/icon.svg': { body: '<svg><script/></svg>' },
  })), /script element/);
});

test('createClient sends the token only to GitHub and maps 404 to null', async () => {
  const seen: { url: string; auth: string | undefined }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: String(url), auth: headers.get('authorization') ?? undefined });
    return new Response(String(url).includes('missing') ? 'no' : '{"ok":true}', { status: String(url).includes('missing') ? 404 : 200 });
  }) as typeof fetch;
  const client = createClient('secret', fetcher);
  assert.deepEqual((await client.json<{ ok: boolean }>('https://api.github.com/x'))?.data, { ok: true });
  assert.equal(await client.json('https://registry.npmjs.org/missing'), null);
  await client.json('https://api.github.com.example.test/x');
  assert.deepEqual(seen.map(s => s.auth), ['Bearer secret', undefined, undefined]);
  const failing = createClient(undefined, (async () => new Response('', { status: 502 })) as typeof fetch);
  await assert.rejects(failing.json('https://api.github.com/x'), /HTTP 502/);
});

test('createClient follows GitHub 301 within api.github.com and sends token on both hops', async () => {
  const seen: { url: string; auth: string | undefined }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: String(url), auth: headers.get('authorization') ?? undefined });
    const urlStr = String(url);
    if (urlStr === `${api}/x`) {
      return new Response('', { status: 301, headers: { 'location': `${api}/y` } });
    }
    if (urlStr === `${api}/y`) {
      return new Response('{"redirected":true}', { status: 200 });
    }
    throw new Error(`unexpected URL ${urlStr}`);
  }) as typeof fetch;
  const client = createClient('secret', fetcher);
  const result = await client.json<{ redirected: boolean }>(`${api}/x`);
  assert.deepEqual(result?.data, { redirected: true });
  assert.deepEqual(seen.map(s => s.auth), ['Bearer secret', 'Bearer secret']);
});

test('readWorkSources reads English Work frontmatter only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'work-'));
  const front = (extra: string) => `---\ntitle: X\nkind: package\nstatus: active\nstack: [typescript]\ntagline: T\nsummary: S\nrole: R\nhighlights: []\n${extra}---\n\n## Problem\n`;
  await writeFile(join(dir, 'deadhead.mdx'), front('repo: cevdetch/deadhead\npackages:\n  - { registry: npm, name: deadhead }\n'));
  await writeFile(join(dir, 'private-tool.mdx'), front(''));
  await writeFile(join(dir, 'deadhead.fr.mdx'), '---\ntagline: Un linter\n---\n');
  assert.deepEqual(await readWorkSources(pathToFileURL(`${dir}/`)), [
    { id: 'deadhead', repo: 'cevdetch/deadhead', packages: [{ registry: 'npm', name: 'deadhead' }], pkgbuilds: false },
    { id: 'private-tool', packages: [], pkgbuilds: false },
  ]);
});

test('createClient rejects GitHub redirect to another origin', async () => {
  const seen: string[] = [];
  const fetcher = (async (url: string | URL | Request, _init?: RequestInit) => {
    seen.push(String(url));
    const urlStr = String(url);
    if (urlStr === `${api}/x`) {
      return new Response('', { status: 302, headers: { 'location': 'https://evil.test/x' } });
    }
    throw new Error(`should not reach ${urlStr}`);
  }) as typeof fetch;
  const client = createClient('secret', fetcher);
  await assert.rejects(client.json(`${api}/x`), /leaves api.github.com/);
  assert.deepEqual(seen, [`${api}/x`]);
});

test('every Work with a site gets the median Lighthouse scores, a few sites at a time', async () => {
  const sites: string[] = [];
  let running = 0;
  let most = 0;
  const lighthouse = async (site: string) => {
    sites.push(site);
    running++;
    most = Math.max(most, running);
    await new Promise(resolve => setTimeout(resolve, 5));
    running--;
    return { facts: { performance: 100, accessibility: 100, bestPractices: 100, seo: 100, measuredAt: '2026-11-14T20:00:00.000Z' } };
  };
  const ids = ['a', 'b', 'c', 'd'];
  const client = fakeClient({
    ...Object.fromEntries(ids.map(id => [`https://${id}.cevdet.ch/icon.svg`, null])),
    [search]: { data: { total_count: 0, items: [] } },
  });
  const collected = await collectFacts([
    ...ids.map(id => ({ id, site: `https://${id}.cevdet.ch/`, packages: [], pkgbuilds: false })),
    { id: 'pkg', packages: [{ registry: 'npm' as const, name: 'pkg' }], pkgbuilds: false },
  ], { ...client, json: async <T>(url: string) => url === 'https://registry.npmjs.org/pkg' ? null : client.json<T>(url) }, { lighthouse });
  assert.deepEqual(sites.sort(), ids.map(id => `https://${id}.cevdet.ch/`));
  assert.ok(most > 1 && most <= 2, `ran ${most} at once`);
  assert.deepEqual(collected.works['a']?.lighthouse, { performance: 100, accessibility: 100, bestPractices: 100, seo: 100, measuredAt: '2026-11-14T20:00:00.000Z', site: 'https://a.cevdet.ch/' });
  assert.deepEqual(collected.held, []);
  assert.equal(collected.works['pkg']?.lighthouse, undefined);
});

const scores = { performance: 100, accessibility: 100, bestPractices: 100, seo: 100 };
const lighthousePrevious = (lighthouse?: LighthouseFacts): Snapshot => ({
  version: 1 as const, refreshedAt: '2026-11-09T06:00:00.000Z', contributions: [],
  works: { x: { packages: [], icon: null, ...(lighthouse ? { lighthouse } : {}) } },
});
const lighthouseRoutes = () => fakeClient({ 'https://x.cevdet.ch/icon.svg': null, [search]: { data: { total_count: 0, items: [] } } });
const xSource = [{ id: 'x', site: 'https://x.cevdet.ch/', packages: [], pkgbuilds: false }];

const site = 'https://x.cevdet.ch/';

test('unchanged scores keep the date they were first measured, so a quiet week changes nothing', async () => {
  const previous = lighthousePrevious({ ...scores, measuredAt: '2026-11-07T05:00:00.000Z', site });
  const same = async () => ({ facts: { ...scores, measuredAt: '2026-11-14T05:00:00.000Z' } });
  assert.equal((await collectFacts(xSource, lighthouseRoutes(), { previous, lighthouse: same })).works['x']?.lighthouse?.measuredAt, '2026-11-07T05:00:00.000Z');
});

test('last scores under 100 give way to the next 100s, dated when they were measured', async () => {
  const previous = lighthousePrevious({ ...scores, bestPractices: 92, measuredAt: '2026-11-07T05:00:00.000Z', site });
  const perfect = async () => ({ facts: { ...scores, measuredAt: '2026-11-14T05:00:00.000Z' } });
  assert.deepEqual((await collectFacts(xSource, lighthouseRoutes(), { previous, lighthouse: perfect })).works['x']?.lighthouse, { ...scores, measuredAt: '2026-11-14T05:00:00.000Z', site });
});

test('a measurement under 100 is held: the last 100s stay with their date, and the refresh reports the scores and failing audits', async () => {
  const warnings: string[] = [];
  const lower = async () => ({
    facts: { ...scores, bestPractices: 92, measuredAt: '2026-11-14T05:00:00.000Z' }, shortfalls: ['best-practices: errors-in-console (2 of 5 runs)'],
  });
  const previous = lighthousePrevious({ ...scores, measuredAt: '2026-11-07T05:00:00.000Z', site });
  const collected = await collectFacts(xSource, lighthouseRoutes(), { previous, lighthouse: lower, warn: message => warnings.push(message) });
  assert.deepEqual(collected.works['x']?.lighthouse, { ...scores, measuredAt: '2026-11-07T05:00:00.000Z', site });
  assert.deepEqual(collected.held, [
    'x: Lighthouse measured best practices 92 on https://x.cevdet.ch/, so it is not published; keeping the last scores. Failing audits: best-practices: errors-in-console (2 of 5 runs)',
  ]);
  assert.deepEqual(warnings, []);
});

test('a measurement under 100 with no last 100s to keep publishes no scores at all', async () => {
  const lower = async () => ({ facts: { ...scores, performance: 99, seo: 92, measuredAt: '2026-11-14T05:00:00.000Z' } });
  const first = await collectFacts(xSource, lighthouseRoutes(), { previous: lighthousePrevious(), lighthouse: lower });
  assert.equal(first.works['x']?.lighthouse, undefined);
  assert.deepEqual(first.held, ['x: Lighthouse measured performance 99, SEO 92 on https://x.cevdet.ch/, so it is not published; no earlier scores to keep. Failing audits: none listed']);
  const previous = lighthousePrevious({ ...scores, performance: 98, measuredAt: '2026-11-07T05:00:00.000Z', site });
  const again = await collectFacts(xSource, lighthouseRoutes(), { previous, lighthouse: lower });
  assert.equal(again.works['x']?.lighthouse, undefined);
  assert.match(again.held[0]!, /; the last scores are under 100, so none are kept\./);
});

test('scores measured on another site, or on an unrecorded one, are replaced even when they are the same', async () => {
  const same = async () => ({ facts: { ...scores, measuredAt: '2026-11-14T05:00:00.000Z' } });
  for (const earlier of [{ site: 'https://x.example.dev/' }, {}]) {
    const previous = lighthousePrevious({ ...scores, measuredAt: '2026-11-07T05:00:00.000Z', ...earlier });
    assert.deepEqual((await collectFacts(xSource, lighthouseRoutes(), { previous, lighthouse: same })).works['x']?.lighthouse, { ...scores, measuredAt: '2026-11-14T05:00:00.000Z', site });
  }
});

test('a skipped measurement keeps the last Lighthouse Facts and warns, naming the site', async () => {
  const warnings: string[] = [];
  const skipped = async () => ({ skipped: 'HTTP 429' });
  const previous = lighthousePrevious({ ...scores, measuredAt: '2026-11-07T05:00:00.000Z', site });
  const collected = await collectFacts(xSource, lighthouseRoutes(), { previous, lighthouse: skipped, warn: message => warnings.push(message) });
  assert.deepEqual(collected.works['x']?.lighthouse, { ...scores, measuredAt: '2026-11-07T05:00:00.000Z', site });
  assert.deepEqual(warnings, ['x: Lighthouse not measured (HTTP 429); keeping the last scores']);
  const first = await collectFacts(xSource, lighthouseRoutes(), { previous: lighthousePrevious(), lighthouse: skipped, warn: message => warnings.push(message) });
  assert.equal(first.works['x']?.lighthouse, undefined);
  assert.equal(warnings[1], 'x: Lighthouse not measured (HTTP 429); no earlier scores to keep');
});

test('a skipped measurement drops scores from another site rather than publish them for this one', async () => {
  const warnings: string[] = [];
  const skipped = async () => ({ skipped: 'HTTP 429' });
  const previous = lighthousePrevious({ ...scores, measuredAt: '2026-11-07T05:00:00.000Z', site: 'https://x.example.dev/' });
  const collected = await collectFacts(xSource, lighthouseRoutes(), { previous, lighthouse: skipped, warn: message => warnings.push(message) });
  assert.equal(collected.works['x']?.lighthouse, undefined);
  assert.deepEqual(warnings, ['x: Lighthouse not measured (HTTP 429); the last scores were measured on another site, so none are kept']);
});

test('a skipped measurement never keeps last scores under 100', async () => {
  const warnings: string[] = [];
  const skipped = async () => ({ skipped: 'HTTP 429' });
  const previous = lighthousePrevious({ ...scores, performance: 99, measuredAt: '2026-11-07T05:00:00.000Z', site });
  const collected = await collectFacts(xSource, lighthouseRoutes(), { previous, lighthouse: skipped, warn: message => warnings.push(message) });
  assert.equal(collected.works['x']?.lighthouse, undefined);
  assert.deepEqual(warnings, ['x: Lighthouse not measured (HTTP 429); the last scores are under 100, so none are kept']);
  assert.equal((await collectFacts(xSource, lighthouseRoutes(), { previous })).works['x']?.lighthouse, undefined);
});

test('without a measurer the last Lighthouse Facts carry over, for the same site only', async () => {
  const previous = lighthousePrevious({ ...scores, measuredAt: '2026-11-07T05:00:00.000Z', site });
  assert.equal((await collectFacts(xSource, lighthouseRoutes(), { previous })).works['x']?.lighthouse?.measuredAt, '2026-11-07T05:00:00.000Z');
  const moved = lighthousePrevious({ ...scores, measuredAt: '2026-11-07T05:00:00.000Z', site: 'https://x.example.dev/' });
  assert.equal((await collectFacts(xSource, lighthouseRoutes(), { previous: moved })).works['x']?.lighthouse, undefined);
});

test('a measurement that fails closed stops the refresh', async () => {
  const broken = async () => { throw new Error('https://x.cevdet.ch/: PageSpeed Insights ended on https://cevdet.ch/'); };
  await assert.rejects(collectFacts(xSource, lighthouseRoutes(), { lighthouse: broken }), /ended on/);
});
