import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createClient, type Client } from '../../src/facts/client.ts';
import { collectFacts, highlightedPulls } from '../../src/facts/refresh.ts';
import { publicRepo } from '../../src/facts/schema.ts';
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
    { id: 'homelab', packages: [], pkgbuilds: false },
  ], client);
  assert.equal(publicRepo(collected.works['deadhead'])?.commitCount, 412);
  assert.equal(publicRepo(collected.works['deadhead'])?.firstCommit, '2026-09-01T10:00:00Z');
  assert.deepEqual(collected.works['deadhead']?.packages.map(p => p.published), [true, false]);
  assert.equal(collected.works['deadhead']?.icon?.file, 'icons/deadhead.svg');
  assert.equal(collected.works['astro-metadata-lab']?.icon, null);
  assert.equal('homelab' in collected.works, false);
  assert.deepEqual(collected.icons, [{ workId: 'deadhead', svg }]);
  assert.equal(collected.contributions.length, 1);
});

test('collectFacts records the review discussion of highlighted pulls only, across pages', async () => {
  const pr = (n: number) => ({ html_url: `https://github.com/withastro/astro/pull/${n}`, number: n, title: 'Fix', repository_url: `${api}/repos/withastro/astro`, pull_request: { merged_at: '2026-06-24T12:35:44Z' } });
  const comment = (login: string) => ({ user: { login, type: 'User' }, body: 'Please rename this.' });
  const client = fakeClient({
    [search]: { data: { total_count: 2, items: [pr(101), pr(102)] } },
    [`${api}/repos/withastro/astro/pulls/101/reviews?per_page=100&page=1`]: { data: [comment('maintainer')] },
    [`${api}/repos/withastro/astro/pulls/101/comments?per_page=100&page=1`]: { data: Array.from({ length: 100 }, () => comment('maintainer')) },
    [`${api}/repos/withastro/astro/pulls/101/comments?per_page=100&page=2`]: { data: [comment('maintainer'), comment('cevdetch')] },
    [`${api}/repos/withastro/astro/issues/101/comments?per_page=100&page=1`]: { data: [comment('netlify[bot]')] },
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
    [`${api}/repos/cevdetch/one`]: { data: { private: true, default_branch: 'main', license: null } },
    [search]: { data: { total_count: 0, items: [] } },
  });
  const collected = await collectFacts([{ id: 'one', repo: 'cevdetch/one', packages: [], pkgbuilds: true }], client);
  assert.deepEqual(collected.works['one'], { repo: { private: true }, packages: [] });
  assert.deepEqual(client.requested, [`${api}/repos/cevdetch/one`, search]);
});

test('a repo the token cannot see stays private only if the last refresh found it private', async () => {
  const routes = { [`${api}/repos/cevdetch/one`]: null, [search]: { data: { total_count: 0, items: [] } } };
  const source = { id: 'one', repo: 'cevdetch/one', packages: [], pkgbuilds: false };
  const previous = { version: 1 as const, refreshedAt: '2026-11-09T06:00:00.000Z', works: { one: { repo: { private: true as const }, packages: [] } }, contributions: [] };
  const collected = await collectFacts([source], fakeClient(routes), { previous });
  assert.deepEqual(collected.works['one']?.repo, { private: true });
  await assert.rejects(collectFacts([source], fakeClient(routes)), /cevdetch\/one: not found/);
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
  await writeFile(join(dir, 'homelab.mdx'), front(''));
  await writeFile(join(dir, 'deadhead.fr.mdx'), '---\ntagline: Un linter\n---\n');
  assert.deepEqual(await readWorkSources(pathToFileURL(`${dir}/`)), [
    { id: 'deadhead', repo: 'cevdetch/deadhead', packages: [{ registry: 'npm', name: 'deadhead' }], pkgbuilds: false },
    { id: 'homelab', packages: [], pkgbuilds: false },
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
