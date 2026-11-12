import { z } from 'astro/zod';
import { id, line } from './common.ts';

// The CV's own choices, decoupled from Featured and from the Tech categories /skills/ uses.
export const cvSchema = z.strictObject({
  // In print order. An entry without a title prints one Work with its highlights; a titled entry
  // groups several Works and prints each one's cvLine.
  projects: z.array(z.strictObject({
    works: z.array(id).min(1),
    title: line(60).optional(),
    // Kept in the data but left off the CV: an entry that is printed only while the page has room.
    optional: z.boolean().default(false),
  })).min(1),
  // In print order, with CV-specific labels. `display` names several Techs as one item,
  // e.g. Debian and Arch Linux as "Linux (Debian, Arch)".
  skills: z.array(z.strictObject({
    label: line(30),
    items: z.array(z.strictObject({ techs: z.array(id).min(1), display: line(60).optional() })).min(1),
  })).min(1),
});
export type CvChoices = z.infer<typeof cvSchema>;
