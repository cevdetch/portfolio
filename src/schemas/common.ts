import { z } from 'astro/zod';

/** Lowercase kebab-case: Tech IDs, Work slugs, Service IDs. */
export const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase kebab-case ID.');
export const yearMonth = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'Use YYYY-MM.');
// YAML loaders may turn an unquoted date into a Date; normalise both to YYYY-MM-DD.
export const isoDate = z.union([z.iso.date(), z.date().transform(date => date.toISOString().slice(0, 10))]);
export const isoDateTime = z.iso.datetime();
export const httpsUrl = z.url({ protocol: /^https$/ });
export const line = (max: number) => z.string().trim().min(1).max(max);
