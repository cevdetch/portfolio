import type { LighthouseFacts } from '../schema.ts';

export const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// Fact key → PageSpeed Insights category id, in the order the page lists them.
const categories = { performance: 'performance', accessibility: 'accessibility', bestPractices: 'best-practices', seo: 'seo' } as const;
type Category = keyof typeof categories;

export interface LighthouseRun extends Record<Category, number> { fetchTime: string }
// A well-formed answer from a run Lighthouse could not finish: the site keeps its last scores.
export interface FailedRun { failed: string }
export type Measured = { facts: LighthouseFacts } | { skipped: string };
export type MeasureLighthouse = (site: string) => Promise<Measured>;

/** The API request for one mobile run. The key travels in a header, so this URL is safe to log. */
export function pagespeedUrl(site: string): string {
  const url = new URL(PSI_API);
  url.searchParams.set('url', site);
  url.searchParams.set('strategy', 'mobile');
  for (const id of Object.values(categories)) url.searchParams.append('category', id);
  return url.href;
}

/** The live PageSpeed Insights analysis of the site, mobile, for a reader to re-check the scores. */
export function analysisUrl(site: string): string {
  return `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(site)}&form_factor=mobile`;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/**
 * One run's scores, 0–100, or a failed run when Lighthouse reports a runtime error or leaves a score empty. Anything
 * else unexpected throws: a malformed answer, a site that ended on another URL, or a page that answered with an
 * error status, which means the Work's site is wrong and must never publish the error page's scores.
 */
export function toLighthouseRun(site: string, body: unknown): LighthouseRun | FailedRun {
  const result = record(record(body)?.['lighthouseResult']);
  if (!result) throw new Error(`${site}: PageSpeed Insights answered with no lighthouseResult`);
  const runtimeError = record(result['runtimeError']);
  if (runtimeError) return { failed: `Lighthouse ${String(runtimeError['code'])}` };
  const final = result['finalDisplayedUrl'] ?? result['finalUrl'];
  if (typeof final !== 'string') throw new Error(`${site}: PageSpeed Insights reported no final URL`);
  if (new URL(final).href !== new URL(site).href) throw new Error(`${site}: PageSpeed Insights ended on ${final}`);
  const formFactor = record(result['configSettings'])?.['formFactor'];
  if (formFactor !== 'mobile') throw new Error(`${site}: PageSpeed Insights run is ${String(formFactor)}, not mobile`);
  const fetchTime = result['fetchTime'];
  if (typeof fetchTime !== 'string' || Number.isNaN(Date.parse(fetchTime))) throw new Error(`${site}: PageSpeed Insights gave no valid fetchTime`);
  const status = record(record(result['audits'])?.['http-status-code']);
  if (!status) throw new Error(`${site}: PageSpeed Insights gave no http-status-code audit`);
  if (status['score'] !== 1) {
    const code = typeof status['displayValue'] === 'string' && status['displayValue'] ? status['displayValue'] : 'unknown';
    throw new Error(`${site}: the page answered HTTP ${code}; check the Work's site`);
  }
  const found = record(result['categories']);
  const scores: Partial<Record<Category, number>> = {};
  for (const [key, id] of Object.entries(categories) as [Category, string][]) {
    const value = record(found?.[id])?.['score'];
    if (value === null || value === undefined) return { failed: `no ${id} score` };
    if (typeof value !== 'number' || value < 0 || value > 1) throw new Error(`${site}: PageSpeed Insights gave no valid ${id} score`);
    scores[key] = Math.round(value * 100);
  }
  return { ...scores as Record<Category, number>, fetchTime: new Date(fetchTime).toISOString() };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)]!;

/** The median per category; measuredAt is the fetch time of the run whose performance score is the median. */
export function medianRun(runs: readonly LighthouseRun[]): LighthouseFacts {
  if (runs.length === 0) throw new Error('Lighthouse: no runs to take the median of');
  const dated = [...runs].sort((a, b) => a.performance - b.performance)[Math.floor((runs.length - 1) / 2)]!;
  return {
    performance: median(runs.map(run => run.performance)),
    accessibility: median(runs.map(run => run.accessibility)),
    bestPractices: median(runs.map(run => run.bestPractices)),
    seo: median(runs.map(run => run.seo)),
    measuredAt: dated.fetchTime,
  };
}

// A run takes 10 to 40 seconds on Google's side; past two minutes it is treated as an outage.
const defaultTimeout = 120_000;
const validKey = /^[A-Za-z0-9_-]+$/;
const detailLength = 200;

/** The API's own error message, if the body has one, with the key masked and the length capped. */
function errorDetail(text: string, key: string): string {
  let message: unknown;
  try { message = record(record(JSON.parse(text))?.['error'])?.['message']; } catch { return ''; }
  if (typeof message !== 'string' || !message.trim()) return '';
  const clean = message.replaceAll(key, '[key]').replace(/\s+/g, ' ').trim();
  return `: ${clean.length > detailLength ? `${clean.slice(0, detailLength)}…` : clean}`;
}

/**
 * Measures a site with `runs` mobile runs, one after another. A missing key, a network error, a timeout, a 429, a
 * 5xx or a run Lighthouse could not finish skips the site, so the refresh keeps its last scores; any other failure
 * throws. A key with characters no API key has (a stray CR or space from .env) throws at once. No message names it.
 */
export function createPageSpeed(rawKey: string | undefined, fetcher: typeof fetch = fetch, { runs = 3, timeoutMs = defaultTimeout } = {}): MeasureLighthouse {
  const key = rawKey?.trim();
  if (key && !validKey.test(key)) throw new Error('PSI_API_KEY contains invalid characters; check .env or the secret');
  return async site => {
    if (!key) return { skipped: 'PSI_API_KEY is not set' };
    const results: LighthouseRun[] = [];
    for (let run = 0; run < runs; run++) {
      let text: string;
      try {
        const response = await fetcher(pagespeedUrl(site), {
          headers: { 'X-goog-api-key': key, 'User-Agent': 'cevdet.ch-fetch-facts' }, signal: AbortSignal.timeout(timeoutMs),
        });
        text = await response.text();
        if (response.status === 429 || response.status >= 500) return { skipped: `HTTP ${response.status}${errorDetail(text, key)}` };
        if (!response.ok) throw new Error(`${site}: PageSpeed Insights HTTP ${response.status}${errorDetail(text, key)}`);
      } catch (error) {
        if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) return { skipped: 'timed out' };
        if (error instanceof TypeError) return { skipped: 'network error' };
        throw error;
      }
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new Error(`${site}: PageSpeed Insights answer is not JSON`); }
      const result = toLighthouseRun(site, body);
      if ('failed' in result) return { skipped: result.failed };
      results.push(result);
    }
    return { facts: medianRun(results) };
  };
}
