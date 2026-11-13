import type { Snapshot } from '../facts/schema.ts';
import type { Education, Experience } from '../schemas/background.ts';
import type { ContributionOverrides } from '../schemas/contributions.ts';
import type { CvChoices } from '../schemas/cv.ts';
import type { Profile } from '../schemas/profile.ts';
import type { Tech } from '../schemas/tech.ts';
import type { UsesSection } from '../schemas/uses.ts';
import type { Work } from '../schemas/work.ts';
import { caseStudyHeadings, caseStudySections, lintText } from './story-lint.ts';
import { escapeRegExp, fillCvLine } from './views.ts';

export interface WorkEntry { id: string; data: Work; body: string }
export interface Portfolio {
  profile: Profile;
  techs: readonly Tech[];
  works: readonly WorkEntry[];
  experience: readonly Experience[];
  education: readonly Education[];
  uses: readonly { id: string; data: UsesSection }[];
  contributions: ContributionOverrides;
  cv: CvChoices;
}

function lintAll(where: string, fields: Record<string, string | readonly string[] | undefined>, pronounFree: boolean): string[] {
  return Object.entries(fields).flatMap(([name, value]) => {
    if (value === undefined) return [];
    if (typeof value === 'string') return lintText(`${where} ${name}`, value, pronounFree);
    return value.flatMap((text, index) => lintText(`${where} ${name}[${index}]`, text, pronounFree));
  });
}

/** The CV links the Work's site where the details name its host, so the host must appear in them. */
function interestLinkErrors(at: string, details: string, linked: WorkEntry | undefined, ref: string): string[] {
  if (!linked) return [`${at}: unknown Work "${ref}"`];
  if (!linked.data.site) return [`${at}: Work "${ref}" has no site to link`];
  const host = new URL(linked.data.site).host;
  return details.includes(host) ? [] : [`${at}: details must name ${host}, the site it links`];
}

/** The home page links each proofWorks entry by title, so that title must appear in the proof as a whole word. */
function proofLinkErrors(at: string, proof: string, linked: WorkEntry): string[] {
  const pattern = new RegExp(`\\b${escapeRegExp(linked.data.title)}\\b`);
  return pattern.test(proof) ? [] : [`${at}: proof must name "${linked.data.title}" as a whole word`];
}

function cvErrors(cv: CvChoices, works: ReadonlyMap<string, WorkEntry>, techIds: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const placed = new Set<string>();
  cv.projects.forEach((entry, index) => {
    const at = `cv projects[${index}]`;
    errors.push(...lintAll(at, { title: entry.title }, true));
    if (!entry.title && entry.works.length !== 1) errors.push(`${at}: an entry without a title holds exactly one Work`);
    for (const ref of entry.works) {
      const linked = works.get(ref);
      if (!linked) errors.push(`${at}: unknown Work "${ref}"`);
      else if (entry.title && !linked.data.cvLine) errors.push(`${at}: Work "${ref}" has no cvLine to print`);
      if (placed.has(ref)) errors.push(`${at}: Work "${ref}" appears in more than one entry`);
      placed.add(ref);
    }
  });
  const listed = new Set<string>();
  cv.skills.forEach((group, index) => {
    errors.push(...lintAll(`cv skills[${index}]`, { label: group.label }, true));
    group.items.forEach((item, position) => {
      const at = `cv skills[${index}] items[${position}]`;
      errors.push(...lintAll(at, { display: item.display }, true));
      for (const ref of item.techs) {
        if (!techIds.has(ref)) errors.push(`${at}: unknown Tech "${ref}"`);
        if (listed.has(ref)) errors.push(`${at}: Tech "${ref}" appears more than once`);
        listed.add(ref);
      }
      if (item.techs.length > 1 && !item.display) errors.push(`${at}: several Techs need a display label`);
    });
  });
  return errors;
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
    errors.push(...lintAll(at, { summary: data.summary, highlights: data.highlights, cvLine: data.cvLine }, true));
    if (data.cvLine) errors.push(...fillCvLine(data.cvLine, facts.works[id]).problems.map(problem => `${at} cvLine: ${problem}`));
    errors.push(...lintAll(at, { body }, false).filter(problem => problem.endsWith('placeholder text')));
    data.metrics.forEach((metric, index) => {
      errors.push(...lintAll(`${at} metrics[${index}]`, { label: metric.label, 'headline label': metric.headline?.label }, false));
    });
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
  errors.push(...lintAll('profile', { headline: p.profile.headline, bio: p.profile.bio, proof: p.profile.proof }, true));
  p.profile.proofWorks.forEach((ref, index) => {
    const at = `profile proofWorks[${index}]`;
    work(at, ref);
    const linked = p.works.find(entry => entry.id === ref);
    if (linked) errors.push(...proofLinkErrors(at, p.profile.proof, linked));
  });
  p.profile.homeMetrics.forEach((pin, index) => {
    const at = `profile homeMetrics[${index}]`;
    work(at, pin.work);
    const linked = p.works.find(entry => entry.id === pin.work);
    if (linked && !linked.data.metrics.some(metric => metric.label === pin.label)) {
      errors.push(`${at}: Work "${pin.work}" has no Metric "${pin.label}"`);
    }
  });
  // Process steps are Story, so they are pronoun-free.
  p.profile.process.forEach((step, index) => {
    const at = `profile process[${index}]`;
    errors.push(...lintAll(at, { title: step.title, detail: step.detail }, true));
  });
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
  errors.push(...cvErrors(p.cv, new Map(p.works.map(entry => [entry.id, entry])), techIds));

  // A refresh can surface a merged pull for an Upstream no one has labelled yet; without a base label it
  // would show its raw repository id in Contribution highlights or Recently shipped.
  const upstreamsByRepo = new Map(p.contributions.upstreams.map(upstream => [upstream.repo, upstream] as const));
  for (const [repo, numbers] of merged) {
    const upstream = upstreamsByRepo.get(repo);
    const visible = [...numbers].some(number => !upstream?.pulls[String(number)]?.hidden);
    if (visible && !upstream?.label) errors.push(`contributions/${repo}: a merged pull has no label in the base Upstreams`);
  }

  const upstreamLabels = new Map(p.contributions.upstreams.map(upstream => [upstream.repo, upstream.label] as const));
  const themeIds = new Set<string>();
  // A repo's theme line only makes sense once: tracked by theme position, so two themes that happen to
  // share an (invalid, duplicate) id still count as two themes for this check.
  const seenInThemes = new Map<string, number>();
  p.contributions.themes.forEach((theme, themeIndex) => {
    const at = `contributions theme ${theme.id}`;
    errors.push(...lintAll(at, { lead: theme.lead, note: theme.note }, true));
    const seenInThisTheme = new Set<string>();
    for (const repo of theme.upstreams) {
      if (!merged.has(repo)) errors.push(`${at}: no merged Contribution to ${repo} in the Snapshot`);
      if (!upstreamLabels.get(repo)) errors.push(`${at}: ${repo} has no label in the base Upstreams`);
      if (seenInThisTheme.has(repo)) errors.push(`${at}: ${repo} appears twice`);
      seenInThisTheme.add(repo);
      const firstThemeIndex = seenInThemes.get(repo);
      if (firstThemeIndex !== undefined && firstThemeIndex !== themeIndex) {
        errors.push(`${at}: ${repo} already appears in theme ${p.contributions.themes[firstThemeIndex]!.id}`);
      } else if (firstThemeIndex === undefined) {
        seenInThemes.set(repo, themeIndex);
      }
    }
    if (themeIds.has(theme.id)) errors.push(`${at}: duplicate id`);
    themeIds.add(theme.id);
  });
  return errors;
}
