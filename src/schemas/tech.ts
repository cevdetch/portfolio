import { z } from 'astro/zod';
import { httpsUrl, id, line } from './common.ts';

// Order is display order on /skills/. `skills` also drives knowsAbout; the CV labels its skills in cv.yaml.
export const techCategories = {
  language: { label: 'Languages', skills: true },
  framework: { label: 'Frameworks & styling', skills: true },
  tooling: { label: 'Runtimes & tooling', skills: true },
  data: { label: 'Data', skills: true },
  infrastructure: { label: 'Infrastructure', skills: true },
  desktop: { label: 'Operating systems & desktop', skills: true },
  app: { label: 'Apps', skills: false },
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
