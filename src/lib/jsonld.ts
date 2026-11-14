import { fullName, pageTitle } from '../data/profile.ts';
import type { WorkEntry } from '../data/validate.ts';
import { publicRepo, type WorkFacts } from '../facts/schema.ts';
import type { Profile } from '../schemas/profile.ts';
import { techCategories, type Tech } from '../schemas/tech.ts';
import * as shared from './structured-data.ts';

// The nodes cevdet.ch emits, built on the shared module every cevdet.ch site copies. The person's name, alternate
// names, url and profiles come from its identity; a unit test keeps profile.yaml, which the visible pages and the
// CV print, in agreement with it.

export { graph, serializeJsonLd } from './structured-data.ts';

const site = shared.identity.url;
// Fixed identifiers: One (one.cevdet.ch) and every other cevdet.ch site reference #person.
export const PERSON_ID = shared.identity.id;
export const WEBSITE_ID = shared.nodeId(site, 'website');
export const PROFILE_ID = shared.nodeId(site, 'profile');

const workPage = (work: WorkEntry) => new URL(`work/${work.id}/`, site).href;

/** The full Person, on the home page that shows these facts. `portrait` is the size of the public/ copy, if any. */
export function personNode(profile: Profile, techs: readonly Tech[], portrait?: { width: number; height: number }) {
  return shared.personNode({
    jobTitle: profile.jobTitle, description: profile.bio, email: profile.email,
    knowsAbout: techs.filter(tech => techCategories[tech.category].skills).map(tech => tech.label),
    image: portrait,
  });
}

export function websiteNode(profile: Profile) {
  return shared.websiteNode({ url: site, name: fullName(profile), alternateName: 'cevdet.ch', inLanguage: 'en' });
}

export function profilePageNode(profile: Profile) {
  // The name mirrors the home page's <title>, not body text (see the exclusion in src/gates/jsonld.ts).
  return shared.profilePageNode({ url: site, name: pageTitle(profile) });
}

export function workNode(work: WorkEntry, facts: WorkFacts | undefined, techs: readonly Tech[]) {
  const page = workPage(work);
  // A site is described by its own WebSite node, under the @id its home page gives it, so the two merge.
  if (work.data.kind === 'site' && work.data.site) {
    return { ...shared.websiteNode({ url: work.data.site, name: work.data.title, description: work.data.summary }), mainEntityOfPage: page };
  }
  const repo = publicRepo(facts);
  const languages = work.data.stack.map(id => techs.find(tech => tech.id === id)).filter(tech => tech?.category === 'language').map(tech => tech!.label);
  return shared.softwareSourceCodeNode({
    url: page, name: work.data.title, description: work.data.summary,
    // Only a repository the Snapshot found public; schema.org has no natural field for "source private", so a
    // private Work simply has no codeRepository.
    codeRepository: work.data.repo && repo ? `https://github.com/${work.data.repo}` : undefined,
    programmingLanguage: languages.length ? languages : undefined,
    license: repo?.license ?? undefined,
    sameAs: work.data.site ? [work.data.site] : undefined,
  });
}

/** The visible trail on a Work page, Home › Work › the Work; the BreadcrumbList follows the same crumbs. */
export function workCrumbs(work: WorkEntry): { name: string; path: string }[] {
  return [{ name: 'Home', path: '/' }, { name: 'Work', path: '/work/' }, { name: work.data.title, path: `/work/${work.id}/` }];
}

export function breadcrumbNode(work: WorkEntry) {
  const crumbs = workCrumbs(work);
  // The last crumb is the page itself, which the shared builder lists without an item.
  return shared.breadcrumbNode(workPage(work), crumbs.map((crumb, index) => ({
    name: crumb.name, url: index === crumbs.length - 1 ? undefined : new URL(crumb.path, site).href,
  })));
}
