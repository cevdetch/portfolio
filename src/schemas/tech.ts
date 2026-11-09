import { z } from 'astro/zod';
import { httpsUrl, id, line } from './common.ts';

// Order is display order on /skills/ and the CV. `skills` also drives knowsAbout.
export const techCategories = {
  language: { label: 'Languages', skills: true, cv: true },
  framework: { label: 'Frameworks & styling', skills: true, cv: true },
  tooling: { label: 'Runtimes & tooling', skills: true, cv: true },
  data: { label: 'Data', skills: true, cv: true },
  infrastructure: { label: 'Infrastructure', skills: true, cv: true },
  desktop: { label: 'Operating systems & desktop', skills: true, cv: false },
  app: { label: 'Apps', skills: false, cv: false },
} as const;

export type TechCategory = keyof typeof techCategories;
const categoryIds = Object.keys(techCategories) as [TechCategory, ...TechCategory[]];

export const techSchema = z.strictObject({
  id,
  label: line(40),
  category: z.enum(categoryIds),
  url: httpsUrl,
});
export type Tech = z.infer<typeof techSchema>;
