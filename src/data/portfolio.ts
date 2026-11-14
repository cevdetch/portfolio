import { getCollection } from 'astro:content';
import { parse } from 'yaml';
import techYaml from '../content/tech.yaml?raw';
import snapshotJson from '../facts/snapshot.json';
import { snapshotSchema, type Snapshot } from '../facts/schema.ts';
import { fillBio } from './profile.ts';
import { validatePortfolio, type Portfolio } from './validate.ts';
import { inSourceOrder, newestFirst } from './views.ts';

export interface LoadedPortfolio extends Portfolio { facts: Snapshot }

let loaded: Promise<LoadedPortfolio> | undefined;

/** Loads every collection and the Snapshot once per build; any invalid reference fails the build. */
export function loadPortfolio(): Promise<LoadedPortfolio> {
  if (import.meta.env.DEV) return load();
  return loaded ??= load();
}

async function load(): Promise<LoadedPortfolio> {
  const [profiles, techs, works, experience, education, uses, contributions, cvs] = await Promise.all([
    getCollection('profile'), getCollection('tech'), getCollection('work'), getCollection('experience'),
    getCollection('education'), getCollection('uses'), getCollection('contributions'), getCollection('cv'),
  ]);
  const profile = profiles[0];
  const overrides = contributions[0];
  const cv = cvs[0];
  if (profiles.length !== 1 || !profile || contributions.length !== 1 || !overrides || cvs.length !== 1 || !cv) {
    throw new Error('Expected exactly one profile.yaml, one contributions.yaml and one cv.yaml.');
  }
  const portfolio: Portfolio = {
    profile: profile.data,
    // The registry's order is the order /skills/ and knowsAbout show.
    techs: inSourceOrder(techs.map(entry => entry.data), (parse(techYaml) as { id: string }[]).map(tech => tech.id)),
    works: works.map(entry => ({ id: entry.id, data: entry.data, body: entry.body ?? '' })),
    experience: newestFirst(experience.map(entry => entry.data)),
    education: newestFirst(education.map(entry => entry.data)),
    uses: uses.map(entry => ({ id: entry.id, data: entry.data })),
    contributions: overrides.data,
    cv: cv.data,
  };
  const facts = snapshotSchema.parse(snapshotJson);
  const errors = validatePortfolio(portfolio, facts);
  if (errors.length) throw new Error(`Portfolio data is invalid:\n- ${errors.join('\n- ')}`);
  // Every page, the CV and the JSON-LD read the bio with its tokens filled; validation checked they all fill.
  const profileData = { ...portfolio.profile, bio: fillBio(portfolio.profile.bio, portfolio.education).text };
  return { ...portfolio, profile: profileData, facts };
}
