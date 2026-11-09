import { z } from 'astro/zod';
import { httpsUrl, isoDateTime } from '../schemas/common.ts';

const registry = z.enum(['npm', 'aur']);

export const repoFactsSchema = z.strictObject({
  license: z.string().nullable(),
  firstCommit: isoDateTime,
  lastCommit: isoDateTime,
  commitCount: z.number().int().positive(),
  latestRelease: z.strictObject({ tag: z.string(), publishedAt: isoDateTime }).nullable(),
});

export const packageFactsSchema = z.discriminatedUnion('published', [
  z.strictObject({ registry, name: z.string(), published: z.literal(false) }),
  z.strictObject({ registry, name: z.string(), published: z.literal(true), version: z.string(), releasedAt: isoDateTime, url: httpsUrl }),
]);

export const workFactsSchema = z.strictObject({
  repo: repoFactsSchema.optional(),
  packages: z.array(packageFactsSchema),
  pkgbuilds: z.array(z.string()).optional(),
  // null: the site serves no /icon.svg, so the Work gets a monogram.
  icon: z.strictObject({ file: z.string().regex(/^icons\/[a-z0-9-]+\.svg$/), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).nullable().optional(),
});

export const contributionSchema = z.strictObject({
  upstream: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  number: z.number().int().positive(),
  title: z.string(),
  url: httpsUrl,
  mergedAt: isoDateTime,
});

export const snapshotSchema = z.strictObject({
  version: z.literal(1),
  refreshedAt: isoDateTime,
  works: z.record(z.string(), workFactsSchema),
  contributions: z.array(contributionSchema),
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type WorkFacts = z.infer<typeof workFactsSchema>;
export type RepoFacts = z.infer<typeof repoFactsSchema>;
export type PackageFacts = z.infer<typeof packageFactsSchema>;
export type Contribution = z.infer<typeof contributionSchema>;
