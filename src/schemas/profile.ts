import { z } from 'astro/zod';
import { httpsUrl, id, line } from './common.ts';

const timeZone = z.string().refine(zone => {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
}, 'Use an IANA time zone.');

const availability = z.strictObject({
  capacity: z.enum(['part-time', 'full-time']),
  timeZone,
  reply: line(60),
  openTo: z.array(z.enum(['employment', 'contract', 'freelance'])).min(1),
  workplace: z.array(z.enum(['remote', 'local'])).min(1),
});
export type Availability = z.infer<typeof availability>;

export const profileSchema = z.strictObject({
  // Privacy: the full name is published; the city, phone and street stay private.
  name: z.literal('Cevdet'),
  familyName: z.literal('Haran'),
  handle: z.literal('cevdetch'),
  jobTitle: line(60),
  // The line under the name on the CV and the site, e.g. "Web performance · Developer tooling · Open source".
  specialisation: line(70),
  // Privacy: the country only, never the city.
  country: line(40),
  headline: line(120),
  bio: line(400),
  // The proof line under the pitch on the home page: creations plus upstream fixes, no counts.
  proof: line(150),
  // The Works proof names by title, so the home page can link each one; validated against that title.
  proofWorks: z.array(id).min(1),
  // The home page's numbers strip: each pin resolves to one of the named Work's Metrics, never a copied value.
  homeMetrics: z.array(z.strictObject({ work: id, label: line(60) })).min(1),
  email: z.email(),
  website: z.literal('https://cevdet.ch/'),
  contactSubject: line(80),
  // The Work that hosts Writing (One).
  writing: id,
  socials: z.array(z.strictObject({ network: z.enum(['github', 'linkedin', 'npm']), url: httpsUrl })).min(1),
  availability,
  services: z.array(z.strictObject({
    id,
    name: line(60),
    summary: line(200),
    evidence: z.array(id).default([]),
  })).min(1),
  languages: z.array(z.strictObject({
    name: line(30),
    level: z.enum(['native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1']),
  })).min(1),
  interests: z.array(z.strictObject({
    label: line(30),
    details: line(120),
    // The CV prints only the interests marked true; /about/ prints them all.
    cv: z.boolean(),
    // A Work whose site the details name, so the CV can link it.
    work: id.optional(),
  })).default([]),
});
export type Profile = z.infer<typeof profileSchema>;
