import { z } from 'astro/zod';
import { id, isoDate, line } from './common.ts';

// Schema only: Notes and Now are not published at launch.
export const noteSchema = z.strictObject({
  title: line(80),
  summary: line(160),
  publishedAt: isoDate,
  works: z.array(id).default([]),
  techs: z.array(id).default([]),
});

export const nowSchema = z.strictObject({
  updatedAt: isoDate,
  focus: z.array(line(160)).min(1),
});
