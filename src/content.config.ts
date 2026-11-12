import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { educationSchema, experienceSchema } from './schemas/background.ts';
import { contributionOverridesSchema } from './schemas/contributions.ts';
import { cvSchema } from './schemas/cv.ts';
import { noteSchema, nowSchema } from './schemas/later.ts';
import { profileSchema } from './schemas/profile.ts';
import { techSchema } from './schemas/tech.ts';
import { usesSectionSchema } from './schemas/uses.ts';
import { workSchema, workTranslationSchema } from './schemas/work.ts';

const content = './src/content';

export const collections = {
  profile: defineCollection({ loader: glob({ pattern: 'profile.yaml', base: content }), schema: profileSchema }),
  tech: defineCollection({ loader: file(`${content}/tech.yaml`), schema: techSchema }),
  // English entries are `<slug>.mdx`; Translations are siblings such as `deadhead.fr.mdx`.
  work: defineCollection({ loader: glob({ pattern: ['*.mdx', '!*.*.mdx'], base: `${content}/work` }), schema: workSchema }),
  workTranslations: defineCollection({ loader: glob({ pattern: '*.*.mdx', base: `${content}/work` }), schema: workTranslationSchema }),
  experience: defineCollection({ loader: file(`${content}/experience.yaml`), schema: experienceSchema }),
  education: defineCollection({ loader: file(`${content}/education.yaml`), schema: educationSchema }),
  uses: defineCollection({ loader: glob({ pattern: '*.yaml', base: `${content}/uses` }), schema: usesSectionSchema }),
  contributions: defineCollection({ loader: glob({ pattern: 'contributions.yaml', base: content }), schema: contributionOverridesSchema }),
  cv: defineCollection({ loader: glob({ pattern: 'cv.yaml', base: content }), schema: cvSchema }),
  notes: defineCollection({ loader: glob({ pattern: '*.mdx', base: `${content}/notes` }), schema: noteSchema }),
  now: defineCollection({ loader: glob({ pattern: 'now.yaml', base: content }), schema: nowSchema }),
};
