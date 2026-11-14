import { z } from 'astro/zod';
import { httpsUrl, isoDateTime } from '../schemas/common.ts';

const registry = z.enum(['npm', 'aur']);

export const publicRepoFactsSchema = z.strictObject({
  private: z.literal(false),
  license: z.string().nullable(),
  firstCommit: isoDateTime,
  lastCommit: isoDateTime,
  commitCount: z.number().int().positive(),
  latestRelease: z.strictObject({ tag: z.string(), publishedAt: isoDateTime }).nullable(),
});

// A private repository yields one Fact, that its source is private: no link, dates or counts.
export const repoFactsSchema = z.discriminatedUnion('private', [publicRepoFactsSchema, z.strictObject({ private: z.literal(true) })]);

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
  // Highlighted pulls only: comments by people other than the author, bots excluded (see countDiscussion).
  discussion: z.strictObject({ comments: z.number().int().nonnegative() }).optional(),
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
export type PublicRepoFacts = z.infer<typeof publicRepoFactsSchema>;
export type PackageFacts = z.infer<typeof packageFactsSchema>;
export type Contribution = z.infer<typeof contributionSchema>;

/** The repository Facts when the repository is public; undefined when it is private or absent. */
export function publicRepo(facts: WorkFacts | undefined): PublicRepoFacts | undefined {
  return facts?.repo && !facts.repo.private ? facts.repo : undefined;
}
