import { fullName } from '../data/profile.ts';
import type { WorkEntry } from '../data/validate.ts';
import { publicRepo, type WorkFacts } from '../facts/schema.ts';
import type { Profile } from '../schemas/profile.ts';
import { techCategories, type Tech } from '../schemas/tech.ts';

// Fixed identifiers: One (one.cevdet.ch) references #person.
export const PERSON_ID = 'https://cevdet.ch/#person';
export const WEBSITE_ID = 'https://cevdet.ch/#website';
export const PROFILE_ID = 'https://cevdet.ch/#profile';

type JsonLdNode = Record<string, unknown>;

export function personNode(profile: Profile, techs: readonly Tech[]): JsonLdNode {
  return {
    '@type': 'Person', '@id': PERSON_ID,
    name: fullName(profile), givenName: profile.name, familyName: profile.familyName, alternateName: [profile.handle],
    url: profile.website, jobTitle: profile.jobTitle, description: profile.bio, email: `mailto:${profile.email}`,
    knowsAbout: techs.filter(tech => techCategories[tech.category].skills).map(tech => tech.label),
    sameAs: profile.socials.map(social => social.url),
  };
}

export function personReference(): JsonLdNode {
  return { '@type': 'Person', '@id': PERSON_ID };
}

export function websiteNode(profile: Profile): JsonLdNode {
  return { '@type': 'WebSite', '@id': WEBSITE_ID, url: profile.website, name: profile.name, alternateName: 'cevdet.ch', publisher: { '@id': PERSON_ID } };
}

export function profilePageNode(profile: Profile): JsonLdNode {
  return {
    // The name mirrors the home page's <title>, not body text (see the exclusion in src/gates/jsonld.ts).
    '@type': 'ProfilePage', '@id': PROFILE_ID, url: profile.website, name: `${fullName(profile)} - ${profile.jobTitle}`,
    isPartOf: { '@id': WEBSITE_ID }, mainEntity: { '@id': PERSON_ID },
  };
}

export function workNode(work: WorkEntry, facts: WorkFacts | undefined, techs: readonly Tech[]): JsonLdNode {
  const page = `https://cevdet.ch/work/${work.id}/`;
  const base = {
    '@id': `${page}#work`, name: work.data.title, description: work.data.summary,
    url: work.data.site ?? page, mainEntityOfPage: page, author: { '@id': PERSON_ID },
    ...(work.data.site ? { sameAs: [work.data.site] } : {}),
  };
  if (work.data.kind === 'site') return { '@type': 'WebSite', ...base };
  const languages = work.data.stack.map(id => techs.find(tech => tech.id === id)).filter(tech => tech?.category === 'language').map(tech => tech!.label);
  return {
    '@type': 'SoftwareSourceCode', ...base,
    // Only a repository the Snapshot found public; schema.org has no natural field for "source private", so a
    // private Work simply has no codeRepository.
    ...(work.data.repo && publicRepo(facts) ? { codeRepository: `https://github.com/${work.data.repo}` } : {}),
    ...(publicRepo(facts)?.license ? { license: `https://spdx.org/licenses/${publicRepo(facts)!.license}.html` } : {}),
    ...(languages.length ? { programmingLanguage: languages } : {}),
  };
}

export function graph(nodes: readonly JsonLdNode[]): JsonLdNode {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
