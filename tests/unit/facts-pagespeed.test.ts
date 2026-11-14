import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analysisUrl, createPageSpeed, medianRun, pagespeedUrl, toLighthouseRun } from '../../src/facts/sources/pagespeed.ts';

const site = 'https://deadhead.cevdet.ch/';

type Scores = { performance?: number | null; accessibility?: number; 'best-practices'?: number; seo?: number | string };

function psiBody(scores: Scores = {}, overrides: Record<string, unknown> = {}) {
  const all = { performance: 0.98, accessibility: 1, 'best-practices': 1, seo: 1, ...scores };
  return {
    id: site,
    lighthouseResult: {
      requestedUrl: site, finalDisplayedUrl: site, fetchTime: '2026-11-14T20:00:00.000Z', lighthouseVersion: '13.0.1',
      configSettings: { formFactor: 'mobile' },
      audits: { 'http-status-code': { id: 'http-status-code', score: 1 } },
      categories: Object.fromEntries(Object.entries(all).map(([key, score]) => [key, { id: key, score }])),
      ...overrides,
    },
  };
}

test('the request names the site, the mobile strategy and all four categories, and never a key', () => {
  const url = new URL(pagespeedUrl(site));
  assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  assert.equal(url.searchParams.get('url'), site);
  assert.equal(url.searchParams.get('strategy'), 'mobile');
  assert.deepEqual(url.searchParams.getAll('category'), ['performance', 'accessibility', 'best-practices', 'seo']);
  assert.equal(url.searchParams.has('key'), false);
});

test('the live analysis link opens PageSpeed Insights on the site, mobile', () => {
  assert.equal(analysisUrl(site), 'https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fdeadhead.cevdet.ch%2F&form_factor=mobile');
});

test('a run reads the four category scores as integers and the fetch time', () => {
  assert.deepEqual(toLighthouseRun(site, psiBody({ performance: 0.976, seo: 0.92 })), {
    performance: 98, accessibility: 100, bestPractices: 100, seo: 92, fetchTime: '2026-11-14T20:00:00.000Z',
  });
});

test('a malformed run fails closed', () => {
  assert.throws(() => toLighthouseRun(site, {}), /no lighthouseResult/);
  assert.throws(() => toLighthouseRun(site, psiBody({ seo: 1.2 })), /seo score/);
  assert.throws(() => toLighthouseRun(site, psiBody({ seo: 'high' })), /seo score/);
  assert.throws(() => toLighthouseRun(site, psiBody({}, { fetchTime: 'yesterday' })), /fetchTime/);
  assert.throws(() => toLighthouseRun(site, psiBody({}, { configSettings: { formFactor: 'desktop' } })), /not mobile/);
  assert.throws(() => toLighthouseRun(site, psiBody({}, { audits: {} })), /no http-status-code audit/);
});

test('a run that Lighthouse could not finish is a failed measurement, not malformed data', () => {
  assert.deepEqual(toLighthouseRun(site, psiBody({}, { runtimeError: { code: 'NO_FCP', message: 'No paint' } })), { failed: 'Lighthouse NO_FCP' });
  assert.deepEqual(toLighthouseRun(site, psiBody({ performance: null })), { failed: 'no performance score' });
  const missing = psiBody();
  delete (missing.lighthouseResult.categories as Record<string, unknown>)['seo'];
  assert.deepEqual(toLighthouseRun(site, missing), { failed: 'no seo score' });
});

test('a site that answers with an error status fails closed, naming the site and the status', () => {
  const notFound = psiBody({ seo: 0.58 }, { audits: { 'http-status-code': { id: 'http-status-code', score: 0, displayValue: '404' } } });
  assert.throws(() => toLighthouseRun(site, notFound), /https:\/\/deadhead\.cevdet\.ch\/: the page answered HTTP 404/);
  const errored = psiBody({}, { audits: { 'http-status-code': { id: 'http-status-code', score: null } } });
  assert.throws(() => toLighthouseRun(site, errored), /answered HTTP unknown/);
});

test('a site that lands on another URL fails closed', () => {
  assert.throws(() => toLighthouseRun(site, psiBody({}, { finalDisplayedUrl: 'https://cevdet.ch/' })), /ended on https:\/\/cevdet\.ch\//);
  const legacy = psiBody();
  delete (legacy.lighthouseResult as Record<string, unknown>)['finalDisplayedUrl'];
  assert.throws(() => toLighthouseRun(site, legacy), /no final URL/);
  (legacy.lighthouseResult as Record<string, unknown>)['finalUrl'] = site;
  assert.deepEqual(toLighthouseRun(site, legacy), { performance: 98, accessibility: 100, bestPractices: 100, seo: 100, fetchTime: '2026-11-14T20:00:00.000Z' });
});

test('the median is taken per category, dated by the run with the median performance', () => {
  const run = (performance: number, accessibility: number, fetchTime: string) => ({ performance, accessibility, bestPractices: 100, seo: 100, fetchTime });
  assert.deepEqual(medianRun([
    run(91, 100, '2026-11-14T20:00:00.000Z'), run(99, 95, '2026-11-14T20:01:00.000Z'), run(96, 98, '2026-11-14T20:02:00.000Z'),
  ]), { performance: 96, accessibility: 98, bestPractices: 100, seo: 100, measuredAt: '2026-11-14T20:02:00.000Z' });
  assert.throws(() => medianRun([]), /no runs/);
});

function fakeFetch(responses: (() => Response | Promise<Response>)[]) {
  const seen: { url: string; key: string | null; signal: boolean }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: String(url), key: headers.get('x-goog-api-key'), signal: init?.signal instanceof AbortSignal });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next();
  }) as typeof fetch;
  return { fetcher, seen };
}

const ok = (scores: Scores = {}, overrides: Record<string, unknown> = {}) => () => Response.json(psiBody(scores, overrides));

test('three runs give the median, with the key in a header and never in the URL', async () => {
  const { fetcher, seen } = fakeFetch([ok({ performance: 0.91 }), ok({ performance: 1 }), ok({ performance: 0.97 })]);
  const measure = createPageSpeed('test-key', fetcher);
  assert.deepEqual(await measure(site), {
    facts: { performance: 97, accessibility: 100, bestPractices: 100, seo: 100, measuredAt: '2026-11-14T20:00:00.000Z' },
  });
  assert.equal(seen.length, 3);
  assert.ok(seen.every(request => request.key === 'test-key' && !request.url.includes('test-key') && request.signal));
});

test('a missing key skips the site without a request', async () => {
  const { fetcher, seen } = fakeFetch([]);
  const outcome = await createPageSpeed(undefined, fetcher)(site);
  assert.ok('skipped' in outcome && /PSI_API_KEY/.test(outcome.skipped));
  assert.equal(seen.length, 0);
});

test('a 429, a 5xx, a network error, a timeout or an unfinished run skips the site, naming the cause and never the key', async () => {
  const timeout = () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
  const network = () => { throw new TypeError('fetch failed'); };
  const unfinished = ok({}, { runtimeError: { code: 'NO_FCP', message: 'No paint' } });
  for (const failure of [() => new Response('{}', { status: 429 }), () => new Response('', { status: 503 }), network, timeout, unfinished, ok({ performance: null })]) {
    const { fetcher } = fakeFetch([ok(), failure]);
    const outcome = await createPageSpeed('test-key', fetcher)(site);
    assert.ok('skipped' in outcome, `expected a skip, got ${JSON.stringify(outcome)}`);
    assert.ok(!outcome.skipped.includes('test-key'));
  }
});

test('any other HTTP error or a malformed 200 fails the refresh', async () => {
  await assert.rejects(createPageSpeed('test-key', fakeFetch([() => new Response('{}', { status: 400 })]).fetcher)(site), /HTTP 400/);
  await assert.rejects(createPageSpeed('test-key', fakeFetch([() => new Response('not json')]).fetcher)(site), /not JSON/);
  await assert.rejects(createPageSpeed('test-key', fakeFetch([ok({}, { finalDisplayedUrl: 'https://cevdet.ch/' })]).fetcher)(site), /ended on/);
});

test('an API error carries its message, with the key masked and the length capped', async () => {
  const error = (status: number, message: string) => () => Response.json({ error: { code: status, message } }, { status });
  const quota = await createPageSpeed('test-key', fakeFetch([error(429, 'Quota exceeded for test-key')]).fetcher)(site);
  assert.deepEqual(quota, { skipped: 'HTTP 429: Quota exceeded for [key]' });
  await assert.rejects(createPageSpeed('test-key', fakeFetch([error(400, `Bad request test-key ${'x'.repeat(400)}`)]).fetcher)(site), (thrown: Error) => {
    assert.match(thrown.message, /^https:\/\/deadhead\.cevdet\.ch\/: PageSpeed Insights HTTP 400: Bad request \[key\] x+…$/);
    assert.ok(!thrown.message.includes('test-key'));
    assert.ok(thrown.message.length < 300);
    return true;
  });
  const bare = await createPageSpeed('test-key', fakeFetch([() => new Response('<html>busy</html>', { status: 503 })]).fetcher)(site);
  assert.deepEqual(bare, { skipped: 'HTTP 503' });
});

test('the key is trimmed once and rejected when it holds anything but letters, digits, _ and -', async () => {
  const { fetcher, seen } = fakeFetch([ok(), ok(), ok()]);
  assert.ok('facts' in await createPageSpeed(' test-key\r\n', fetcher)(site));
  assert.ok(seen.every(request => request.key === 'test-key'));
  for (const bad of ['test key', 'test-key\u0000x', 'tést']) {
    assert.throws(() => createPageSpeed(bad, fakeFetch([]).fetcher), (thrown: Error) => {
      assert.equal(thrown.message, 'PSI_API_KEY contains invalid characters; check .env or the secret');
      return true;
    });
  }
  assert.ok('skipped' in await createPageSpeed('  ', fakeFetch([]).fetcher)(site));
});
