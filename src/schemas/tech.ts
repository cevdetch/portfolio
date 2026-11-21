import { z } from 'astro/zod';
import { httpsUrl, id, line } from './common.ts';

// Order is display order on /skills/. `skills` also drives knowsAbout; the CV labels its skills in cv.yaml.
// `evidenced` keeps a skills category in knowsAbout only where a Work's Stack or an Upstream names the Tech, so the
// structured data leaves out the everyday desktop and command-line tools that /skills/ and /uses/ still list, and
// names an AI skill only where a Work shows it.
export const techCategories = {
  language: { label: 'Languages', skills: true, evidenced: false },
  framework: { label: 'Frameworks & styling', skills: true, evidenced: false },
  tooling: { label: 'Runtimes & tooling', skills: true, evidenced: false },
  data: { label: 'Data', skills: true, evidenced: false },
  infrastructure: { label: 'Infrastructure', skills: true, evidenced: false },
  ai: { label: 'AI & structured data', skills: true, evidenced: true },
  desktop: { label: 'Operating systems & desktop', skills: true, evidenced: true },
  app: { label: 'Apps', skills: false, evidenced: false },
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
