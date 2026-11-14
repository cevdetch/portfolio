import { z } from 'astro/zod';
import { httpsUrl, id, isoDate, line } from './common.ts';

export const workKinds = ['app', 'site', 'package', 'template', 'research', 'tool', 'infrastructure'] as const;
export const workStatuses = ['active', 'maintained', 'complete', 'archived'] as const;

/**
 * True when a headline value is safe to print beside its Metric's full value: equal to the full value's
 * leading number token (digits, thousands separators and a decimal point, with an optional unit such as
 * `%`), or, for a percentage, that token rounded to whole units with the same unit. A partial match on the
 * token, such as "4" inside "4,570", never counts: the headline must name the whole number, not a fragment.
 */
export function headlineMatchesValue(value: string, headlineValue: string): boolean {
  const token = /^[\d,]+(?:\.\d+)?%?/.exec(value.trim())?.[0];
  if (!token) return false;
  if (token === headlineValue) return true;
  const full = /^([\d,]+(?:\.\d+)?)%$/.exec(token);
  const headline = /^(\d+)%$/.exec(headlineValue);
  if (!full || !headline) return false;
  return Math.round(Number(full[1]!.replaceAll(',', ''))) === Number(headline[1]!);
}

export const metricSchema = z.strictObject({
  label: line(60),
  value: line(40),
  measuredAt: isoDate,
  source: z.strictObject({ label: line(120), url: httpsUrl.optional() }),
  // The numbers strip's short form: value derived from the full value above (see headlineMatchesValue), so it
  // can never drift from the sourced Metric it summarises.
  headline: z.strictObject({ value: line(12), label: line(60) }).optional(),
}).refine(metric => !metric.headline || headlineMatchesValue(metric.value, metric.headline.value), {
  message: 'headline value must be the value\'s leading number, or that percentage rounded to whole units',
  path: ['headline', 'value'],
});
export type Metric = z.infer<typeof metricSchema>;

export const packageRefSchema = z.strictObject({
  registry: z.enum(['npm', 'aur']),
  name: z.string().regex(/^(?:@[a-z0-9-]+\/)?[a-z0-9._-]+$/),
});
export type PackageRef = z.infer<typeof packageRefSchema>;

// Language-neutral fields live once, beside the English Story, so Translations cannot drift.
const neutral = {
  kind: z.enum(workKinds),
  status: z.enum(workStatuses),
  featured: z.boolean().default(false),
  order: z.number().int().positive().optional(),
  // Public repositories only; a private Work has no repo link and no GitHub Facts.
  repo: z.string().regex(/^cevdetch\/[A-Za-z0-9._-]+$/).optional(),
  site: httpsUrl.optional(),
  packages: z.array(packageRefSchema).default([]),
  // Fetch the list of top-level PKGBUILD folders from this Work's repo.
  pkgbuilds: z.boolean().default(false),
  stack: z.array(id).min(1),
  metrics: z.array(metricSchema).default([]),
};

// Story fields a Translation may override.
const story = {
  title: line(60),
  tagline: line(70),
  summary: line(160),
  role: line(80),
  highlights: z.array(line(240)).max(3),
  // One sentence a reader needs before judging the Work, such as a starter being unstyled on purpose. Shown on
  // the Work page and wherever /hire/ cites the Work as evidence.
  caveat: line(100).optional(),
  // The one line a grouped CV entry prints for this Work, after its title. `{pkgbuilds}` is
  // replaced by the Snapshot's PKGBUILD count (see fillCvLine), so no count is typed by hand.
  cvLine: line(200).optional(),
};

export const workSchema = z.strictObject({ ...neutral, ...story });
export type Work = z.infer<typeof workSchema>;
export const workTranslationSchema = z.strictObject(Object.fromEntries(Object.entries(story).map(([k, v]) => [k, v.optional()])));
