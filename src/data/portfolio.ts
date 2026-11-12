import { getCollection } from 'astro:content';
import { parse } from 'yaml';
import techYaml from '../content/tech.yaml?raw';
import snapshotJson from '../facts/snapshot.json';
import { snapshotSchema, type Snapshot } from '../facts/schema.ts';
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
  const [profiles, techs, works, experience, education, uses, contributions] = await Promise.all([
    getCollection('profile'), getCollection('tech'), getCollection('work'), getCollection('experience'),
    getCollection('education'), getCollection('uses'), getCollection('contributions'),
  ]);
  const profile = profiles[0];
  const overrides = contributions[0];
  if (profiles.length !== 1 || !profile || contributions.length !== 1 || !overrides) {
    throw new Error('Expected exactly one profile.yaml and one contributions.yaml.');
  }
  const portfolio: Portfolio = {
    profile: profile.data,
    // The registry's order is the order /skills/, knowsAbout and the CV show.
    techs: inSourceOrder(techs.map(entry => entry.data), (parse(techYaml) as { id: string }[]).map(tech => tech.id)),
    works: works.map(entry => ({ id: entry.id, data: entry.data, body: entry.body ?? '' })),
    experience: newestFirst(experience.map(entry => entry.data)),
    education: newestFirst(education.map(entry => entry.data)),
    uses: uses.map(entry => ({ id: entry.id, data: entry.data })),
    contributions: overrides.data,
  };
  const facts = snapshotSchema.parse(snapshotJson);
  const errors = validatePortfolio(portfolio, facts);
  if (errors.length) throw new Error(`Portfolio data is invalid:\n- ${errors.join('\n- ')}`);
  return { ...portfolio, facts };
}
