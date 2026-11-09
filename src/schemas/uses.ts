import { z } from 'astro/zod';
import { id, line } from './common.ts';

export const usesSectionSchema = z.strictObject({
  title: line(40),
  order: z.number().int().positive(),
  // A section-level link, e.g. Homelab → the homelab Work.
  work: id.optional(),
  entries: z.array(z.strictObject({
    tech: id,
    note: line(120).optional(),
    maintains: id.optional(),
  })).min(1),
});
export type UsesSection = z.infer<typeof usesSectionSchema>;
