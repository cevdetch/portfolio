import { z } from 'astro/zod';
import { id, line } from './common.ts';

const repo = z.string().regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/);

// Overrides only: the pull requests themselves come from the fetched Snapshot, never by hand.
export const contributionOverridesSchema = z.strictObject({
  upstreams: z.array(z.strictObject({
    repo,
    // Best-known projects first; unordered Upstreams follow by PR count, then name.
    order: z.number().int().positive().optional(),
    // The display name shown in Contribution highlights, themed lines and the CV; falls back to the repo id when absent.
    label: line(40).optional(),
    techs: z.array(id).default([]),
    works: z.array(id).default([]),
    pulls: z.record(z.string().regex(/^\d+$/), z.strictObject({
      // Keeps the pull off the home page (Contribution highlights and Recently shipped) and out of the merge span,
      // such as a claim no one measured; /open-source/ still lists every merged pull.
      hidden: z.boolean().default(false),
      highlight: z.boolean().default(false),
      // Fixes the order of the home page's Contribution highlights; ignored unless highlight is true.
      order: z.number().int().positive().optional(),
      note: line(200).optional(),
    })).default({}),
  })),
  // One line each on the CV and the home page: "<lead> <labels, linked>, <note>." No counts.
  // Each repo must appear in the base `upstreams` list above, with a label; validatePortfolio checks this.
  themes: z.array(z.strictObject({
    id,
    lead: line(80),
    note: line(120).optional(),
    upstreams: z.array(repo).min(1),
  })).default([]),
});
export type ContributionOverrides = z.infer<typeof contributionOverridesSchema>;
