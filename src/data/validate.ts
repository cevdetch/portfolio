import type { Snapshot } from '../facts/schema.ts';
import type { Education, Experience } from '../schemas/background.ts';
import type { ContributionOverrides } from '../schemas/contributions.ts';
import type { Profile } from '../schemas/profile.ts';
import type { Tech } from '../schemas/tech.ts';
import type { UsesSection } from '../schemas/uses.ts';
import type { Work } from '../schemas/work.ts';
import { caseStudyHeadings, caseStudySections, lintText } from './story-lint.ts';

export interface WorkEntry { id: string; data: Work; body: string }
export interface Portfolio {
  profile: Profile;
  techs: readonly Tech[];
  works: readonly WorkEntry[];
  experience: readonly Experience[];
  education: readonly Education[];
  uses: readonly { id: string; data: UsesSection }[];
  contributions: ContributionOverrides;
}

function lintAll(where: string, fields: Record<string, string | readonly string[] | undefined>, cvShared: boolean): string[] {
  return Object.entries(fields).flatMap(([name, value]) => {
    if (value === undefined) return [];
    if (typeof value === 'string') return lintText(`${where} ${name}`, value, cvShared);
    return value.flatMap((text, index) => lintText(`${where} ${name}[${index}]`, text, cvShared));
  });
}

/** The CV links the Work's site where the details name its host, so the host must appear in them. */
function interestLinkErrors(at: string, details: string, linked: WorkEntry | undefined, ref: string): string[] {
  if (!linked) return [`${at}: unknown Work "${ref}"`];
  if (!linked.data.site) return [`${at}: Work "${ref}" has no site to link`];
  const host = new URL(linked.data.site).host;
  return details.includes(host) ? [] : [`${at}: details must name ${host}, the site it links`];
}

export function validatePortfolio(p: Portfolio, facts: Snapshot): string[] {
  const errors: string[] = [];
  const techIds = new Set(p.techs.map(tech => tech.id));
  const workIds = new Set(p.works.map(work => work.id));
  const tech = (where: string, ref: string) => { if (!techIds.has(ref)) errors.push(`${where}: unknown Tech "${ref}"`); };
  const work = (where: string, ref: string) => { if (!workIds.has(ref)) errors.push(`${where}: unknown Work "${ref}"`); };

  const labels = new Set<string>();
  for (const { label } of p.techs) {
    if (labels.has(label)) errors.push(`tech: duplicate label "${label}"`);
    labels.add(label);
  }

  for (const { id, data, body } of p.works) {
    const at = `work/${id}`;
    data.stack.forEach(ref => tech(`${at} stack`, ref));
    if (data.repo && data.repo.split('/')[1] !== id) errors.push(`${at}: slug must equal the repo name (${data.repo})`);
    if (data.featured !== (data.order !== undefined)) errors.push(`${at}: featured and order go together`);
    const headings = caseStudyHeadings(body);
    if (headings.join() !== caseStudySections.join()) {
      errors.push(`${at}: Case study sections must be ${caseStudySections.join(', ')}; found ${headings.join(', ') || 'none'}`);
    }
    errors.push(...lintAll(at, { title: data.title, tagline: data.tagline, role: data.role }, false));
    errors.push(...lintAll(at, { summary: data.summary, highlights: data.highlights }, true));
    errors.push(...lintAll(at, { body }, false).filter(problem => problem.endsWith('placeholder text')));
    data.metrics.forEach((metric, index) => errors.push(...lintAll(`${at} metrics[${index}]`, { label: metric.label }, false)));
    const sourced = data.repo || data.site || data.packages.length > 0 || data.pkgbuilds;
    if (sourced && !facts.works[id]) errors.push(`${at}: no Facts in the Snapshot; run pnpm fetch-facts`);
  }
  const orders = p.works.flatMap(({ data }) => data.featured && data.order !== undefined ? [data.order] : []).sort((a, b) => a - b);
  if (orders.some((order, index) => order !== index + 1)) {
    errors.push(`work: Featured order must run 1..${orders.length} without gaps (found ${orders.join(', ')})`);
  }
  for (const id of Object.keys(facts.works)) {
    if (!workIds.has(id)) errors.push(`snapshot: Facts for unknown Work "${id}"; run pnpm fetch-facts`);
  }

  for (const entry of p.experience) {
    entry.stack.forEach(ref => tech(`experience/${entry.id} stack`, ref));
    errors.push(...lintAll(`experience/${entry.id}`, { highlights: entry.highlights }, true));
  }
  for (const entry of p.education) errors.push(...lintAll(`education/${entry.id}`, { note: entry.note }, true));

  for (const { id, data } of p.uses) {
    if (data.work) work(`uses/${id}`, data.work);
    data.entries.forEach((entry, index) => {
      tech(`uses/${id}`, entry.tech);
      if (entry.maintains) work(`uses/${id} maintains`, entry.maintains);
      errors.push(...lintAll(`uses/${id} entries[${index}]`, { note: entry.note }, false));
    });
  }

  p.profile.services.forEach(service => service.evidence.forEach(ref => work(`profile service ${service.id}`, ref)));
  work('profile writing', p.profile.writing);
  errors.push(...lintAll('profile', { headline: p.profile.headline, bio: p.profile.bio }, true));
  for (const service of p.profile.services) {
    errors.push(...lintAll(`profile service ${service.id}`, { name: service.name, summary: service.summary }, false));
  }
  // Interests go on the CV, so they follow the CV-shared rules.
  p.profile.interests.forEach((interest, index) => {
    const at = `profile interests[${index}]`;
    errors.push(...lintAll(at, { label: interest.label, details: interest.details }, true));
    if (interest.work) errors.push(...interestLinkErrors(at, interest.details, p.works.find(entry => entry.id === interest.work), interest.work));
  });

  const merged = new Map<string, Set<number>>();
  for (const c of facts.contributions) {
    const numbers = merged.get(c.upstream) ?? new Set<number>();
    numbers.add(c.number);
    merged.set(c.upstream, numbers);
  }
  for (const upstream of p.contributions.upstreams) {
    const at = `contributions/${upstream.repo}`;
    const numbers = merged.get(upstream.repo);
    if (!numbers) { errors.push(`${at}: no merged Contribution in the Snapshot`); continue; }
    upstream.techs.forEach(ref => tech(at, ref));
    upstream.works.forEach(ref => work(at, ref));
    for (const number of Object.keys(upstream.pulls)) {
      if (!numbers.has(Number(number))) errors.push(`${at}#${number}: not in the Snapshot`);
    }
    for (const [number, pull] of Object.entries(upstream.pulls)) errors.push(...lintAll(`${at}#${number}`, { note: pull.note }, false));
  }
  return errors;
}
