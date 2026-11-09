import { z } from 'astro/zod';
import { id, line, yearMonth } from './common.ts';

export const experienceSchema = z.strictObject({
  id,
  organisation: line(80),
  role: line(80),
  engagement: z.enum(['employed', 'freelance']),
  workplace: z.enum(['remote', 'onsite', 'hybrid']),
  start: yearMonth,
  end: yearMonth.optional(),
  highlights: z.array(line(240)).max(3),
  stack: z.array(id).default([]),
});
export type Experience = z.infer<typeof experienceSchema>;

// No location field: the city exists only in the locally rendered full CV, never in public output.
export const educationSchema = z.strictObject({
  id,
  institution: line(80),
  credential: line(80),
  field: line(80).optional(),
  start: yearMonth,
  end: yearMonth,
  expected: z.boolean().default(false),
  note: line(160).optional(),
});
export type Education = z.infer<typeof educationSchema>;
