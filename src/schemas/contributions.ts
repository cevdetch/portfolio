import { z } from 'astro/zod';
import { id, line } from './common.ts';

// Overrides only: the pull requests themselves come from the fetched Snapshot, never by hand.
export const contributionOverridesSchema = z.strictObject({
  upstreams: z.array(z.strictObject({
    repo: z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/),
    // Best-known projects first; unordered Upstreams follow by PR count, then name.
    order: z.number().int().positive().optional(),
    techs: z.array(id).default([]),
    works: z.array(id).default([]),
    pulls: z.record(z.string().regex(/^\d+$/), z.strictObject({
      hidden: z.boolean().default(false),
      highlight: z.boolean().default(false),
      note: line(200).optional(),
    })).default({}),
  })),
});
export type ContributionOverrides = z.infer<typeof contributionOverridesSchema>;
