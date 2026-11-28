import type { LighthouseFacts } from '../schema.ts';

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// Fact key → PageSpeed Insights category id, in the order the page lists them.
const categories = { performance: 'performance', accessibility: 'accessibility', bestPractices: 'best-practices', seo: 'seo' } as const;
type Category = keyof typeof categories;

export interface LighthouseScores extends Record<Category, number> { fetchTime: string }
// Shortfalls name what cost a run its 100s, as `category: audit`, so a site that measures lower can be debugged.
export interface LighthouseRun extends LighthouseScores { shortfalls: string[] }
// A well-formed answer from a run Lighthouse could not finish: the site keeps its last scores.
export interface FailedRun { failed: string }
type Measured = { facts: LighthouseFacts; shortfalls?: readonly string[] } | { skipped: string };
export type MeasureLighthouse = (site: string) => Promise<Measured>;

// PageSpeed Insights answers a repeated request from its cache for a minute or more, and its cache key holds the
// report's locale but not the utm parameters. One English locale per run makes every run a measurement of its own;
// the scores do not depend on the locale.
const locales = ['en-US', 'en-GB', 'en-AU', 'en-IN', 'en'] as const;

// Runs per site, one per locale; the pages say how many the scores were taken from.
export const lighthouseRuns = locales.length;

/** The API request for one mobile run. The key travels in a header, so this URL is safe to log. */
export function pagespeedUrl(site: string, run = 0): string {
  const locale = locales[run];
  if (!locale) throw new Error(`Lighthouse: run ${run + 1} has no locale of its own; at most ${locales.length} runs`);
  const url = new URL(PSI_API);
  url.searchParams.set('url', site);
  url.searchParams.set('strategy', 'mobile');
  url.searchParams.set('locale', locale);
  for (const id of Object.values(categories)) url.searchParams.append('category', id);
  return url.href;
}

/** The live PageSpeed Insights analysis of the site, mobile, for a reader to re-check the scores. */
export function analysisUrl(site: string): string {
  return `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(site)}&form_factor=mobile`;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** The weighted audits of a category that scored under 1, or the category alone when the answer lists none. */
function failingAudits(id: string, category: Record<string, unknown> | undefined, audits: Record<string, unknown> | undefined): string[] {
  const refs = Array.isArray(category?.['auditRefs']) ? category['auditRefs'] as unknown[] : [];
  const failing = refs.flatMap(ref => {
    const audit = record(ref)?.['id'];
    const weight = record(ref)?.['weight'];
    if (typeof audit !== 'string' || typeof weight !== 'number' || weight <= 0) return [];
    const score = record(audits?.[audit])?.['score'];
    return typeof score === 'number' && score < 1 ? [`${id}: ${audit}`] : [];
  });
  return failing.length ? failing : [id];
}

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
  const audits = record(result['audits']);
  const status = record(audits?.['http-status-code']);
  if (!status) throw new Error(`${site}: PageSpeed Insights gave no http-status-code audit`);
  if (status['score'] !== 1) {
    const code = typeof status['displayValue'] === 'string' && status['displayValue'] ? status['displayValue'] : 'unknown';
    throw new Error(`${site}: the page answered HTTP ${code}; check the Work's site`);
  }
  const found = record(result['categories']);
  const scores: Partial<Record<Category, number>> = {};
  const shortfalls: string[] = [];
  for (const [key, id] of Object.entries(categories) as [Category, string][]) {
    const category = record(found?.[id]);
    const value = category?.['score'];
    if (value === null || value === undefined) return { failed: `no ${id} score` };
    if (typeof value !== 'number' || value < 0 || value > 1) throw new Error(`${site}: PageSpeed Insights gave no valid ${id} score`);
    scores[key] = Math.round(value * 100);
    if (scores[key] < 100) shortfalls.push(...failingAudits(id, category, audits));
  }
  return { ...scores as Record<Category, number>, fetchTime: new Date(fetchTime).toISOString(), shortfalls };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)]!;

/**
 * Performance from the best run, the other categories from the median. A PageSpeed Insights host that stalls before
 * the first paint only ever slows a run, so the fastest run is the site's own speed, while a real regression slows
 * every run and still shows. measuredAt is the fetch time of the best run, the first on a tie.
 */
export function combineRuns(runs: readonly LighthouseScores[]): LighthouseFacts {
  if (runs.length === 0) throw new Error('Lighthouse: no runs to combine');
  const best = runs.reduce((top, run) => run.performance > top.performance ? run : top);
  return {
    performance: best.performance,
    accessibility: median(runs.map(run => run.accessibility)),
    bestPractices: median(runs.map(run => run.bestPractices)),
    seo: median(runs.map(run => run.seo)),
    measuredAt: best.fetchTime,
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
export function createPageSpeed(rawKey: string | undefined, fetcher: typeof fetch = fetch, { runs = lighthouseRuns, timeoutMs = defaultTimeout } = {}): MeasureLighthouse {
  const key = rawKey?.trim();
  if (key && !validKey.test(key)) throw new Error('PSI_API_KEY contains invalid characters; check .env or the secret');
  return async site => {
    if (!key) return { skipped: 'PSI_API_KEY is not set' };
    const results: LighthouseRun[] = [];
    for (let run = 0; run < runs; run++) {
      let text: string;
      try {
        const response = await fetcher(pagespeedUrl(site, run), {
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
    // Two runs with one fetch time are one measurement answered twice from the cache, not two runs.
    if (new Set(results.map(result => result.fetchTime)).size < results.length) return { skipped: 'PageSpeed Insights answered a run from its cache' };
    const facts = combineRuns(results);
    // The shortfalls of each category the Facts have under 100, with the share of runs each cost, so a one-off reads
    // differently from a steady failure.
    const under = (Object.entries(categories) as [Category, string][]).filter(([key]) => facts[key] < 100).map(([, id]) => id);
    const counts = new Map<string, number>();
    for (const result of results) for (const shortfall of new Set(result.shortfalls)) counts.set(shortfall, (counts.get(shortfall) ?? 0) + 1);
    const shortfalls = [...counts].filter(([shortfall]) => under.includes(shortfall.split(':')[0]!))
      .map(([shortfall, count]) => `${shortfall} (${count} of ${results.length} runs)`);
    return { facts, ...(shortfalls.length ? { shortfalls } : {}) };
  };
}
