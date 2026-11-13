import type { LoadedPortfolio } from '../data/portfolio.ts';
import { fullName, socialUsername } from '../data/profile.ts';
import { fillCvLine, mergedPullsUrl, upstreamLabel } from '../data/views.ts';
import type { WorkEntry } from '../data/validate.ts';
import type { Snapshot } from '../facts/schema.ts';
import { joinList } from '../lib/format.ts';
import type { ContributionOverrides } from '../schemas/contributions.ts';
import type { CvChoices } from '../schemas/cv.ts';
import type { Profile } from '../schemas/profile.ts';
import type { Tech } from '../schemas/tech.ts';

type Entry = Record<string, string | readonly string[]>;
export interface RenderCvDocument {
  cv: {
    name: string; headline: string; location: string; email: string;
    social_networks: { network: 'LinkedIn' | 'GitHub'; username: string }[];
    sections: Record<string, readonly (string | Entry)[]> & { projects: Entry[]; education: Entry[]; skills: Entry[]; open_source: Entry[] };
  };
  locale: { language: 'english' };
  settings: { current_date: string; bold_keywords: string[]; pdf_title: string };
}

/** Story is plain text; RenderCV reads inline Markdown, so escape it. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]]/g, match => `\\${match}`);
}

/** One item per language with its own level, e.g. "Turkish (Native) · English (C1)". */
export function languagesLine(languages: Profile['languages']): string {
  const label = (level: string) => level === 'native' ? 'Native' : level;
  return languages.map(({ name, level }) => `${escapeMarkdown(name)} (${label(level)})`).join(' · ');
}

// RenderCV's own network names, in header order; it has no npm network, so npm stays off the CV.
const cvNetworks = [['github', 'GitHub'], ['linkedin', 'LinkedIn']] as const;

export function socialNetworks(socials: Profile['socials']): RenderCvDocument['cv']['social_networks'] {
  return cvNetworks.flatMap(([network, name]) => {
    const social = socials.find(item => item.network === network);
    return social ? [{ network: name, username: socialUsername(social.url) }] : [];
  });
}

/** Country and time zone only: the city stays in the locally rendered full CV. */
function location({ country, availability }: Profile): string {
  const zone = availability.workplace.includes('remote') ? `Remote-friendly (${availability.timeZone})` : availability.timeZone;
  return `${escapeMarkdown(country)} · ${zone}`;
}

const month = (iso: string) => iso.slice(0, 7);
const ongoing = (work: WorkEntry) => work.data.status === 'active' || work.data.status === 'maintained';
const host = (url: string) => new URL(url).host;

function linkedTitle({ data }: WorkEntry): string {
  const title = escapeMarkdown(data.title);
  const link = data.repo ? `https://github.com/${data.repo}` : data.site;
  return link ? `[${title}](${link})` : title;
}

/** From the earliest first commit to "present" while any Work is ongoing, else to the latest last commit. */
function dates(works: readonly WorkEntry[], facts: Snapshot): Entry {
  const repos = works.flatMap(work => facts.works[work.id]?.repo ?? []);
  if (!repos.length) return {};
  const start = repos.map(repo => repo.firstCommit).sort()[0]!;
  const end = repos.map(repo => repo.lastCommit).sort().at(-1)!;
  return { start_date: month(start), end_date: works.some(ongoing) ? 'present' : month(end) };
}

function project(entry: CvChoices['projects'][number], works: ReadonlyMap<string, WorkEntry>, facts: Snapshot): Entry {
  const members = entry.works.map(id => works.get(id)!);
  if (!entry.title) {
    const [work] = members as [WorkEntry];
    const site = work.data.repo && work.data.site ? ` · [${host(work.data.site)}](${work.data.site})` : '';
    return { name: `${linkedTitle(work)}${site}`, ...dates(members, facts), highlights: work.data.highlights.map(escapeMarkdown) };
  }
  return {
    name: escapeMarkdown(entry.title),
    ...dates(members, facts),
    highlights: members.map(work => `${linkedTitle(work)}: ${fillCvLine(escapeMarkdown(work.data.cvLine!), facts.works[work.id]).text}`),
  };
}

function openSource(overrides: ContributionOverrides, handle: string): Entry[] {
  return overrides.themes.map(theme => {
    const links = theme.upstreams.map(repo => `[${escapeMarkdown(upstreamLabel(repo, overrides))}](${mergedPullsUrl(repo, handle)})`);
    return { bullet: `${escapeMarkdown(theme.lead)} ${joinList(links, 'and')}${theme.note ? `, ${escapeMarkdown(theme.note)}` : ''}.` };
  });
}

function skills(groups: CvChoices['skills'], techs: readonly Tech[]): Entry[] {
  const label = new Map(techs.map(tech => [tech.id, tech.label]));
  return groups.map(group => ({
    label: escapeMarkdown(group.label),
    details: group.items.map(item => escapeMarkdown(item.display ?? item.techs.map(id => label.get(id)!).join(', '))).join(', '),
  }));
}

/** The details name the linked Work's host (validated), so that host becomes the link. */
function interests(profile: Profile, works: ReadonlyMap<string, WorkEntry>): Entry[] {
  return profile.interests.filter(interest => interest.cv).map(interest => {
    const site = interest.work ? works.get(interest.work)?.data.site : undefined;
    const details = escapeMarkdown(interest.details);
    return { label: escapeMarkdown(interest.label), details: site ? details.replace(host(site), `[${host(site)}](${site})`) : details };
  });
}

export function buildCv(data: LoadedPortfolio): RenderCvDocument {
  const { profile, facts } = data;
  const works = new Map(data.works.map(work => [work.id, work]));
  const cvInterests = interests(profile, works);
  const languages = { label: 'Languages', details: languagesLine(profile.languages) };
  return {
    cv: {
      name: fullName(profile),
      headline: `${escapeMarkdown(profile.jobTitle)} · ${escapeMarkdown(profile.specialisation)}`,
      location: location(profile),
      email: profile.email,
      // No website link: fewer contact items; cevdet.ch already appears in the project headings and the One link.
      social_networks: socialNetworks(profile.socials),
      sections: {
        summary: [escapeMarkdown(profile.bio)],
        // A student profile: education sits above experience.
        education: data.education.map(e => ({
          institution: escapeMarkdown(e.institution), degree: escapeMarkdown(e.credential),
          ...(e.field ? { area: escapeMarkdown(e.field) } : {}),
          // An expected end date prints alone as "Expected June 2028": `expected` fills the
          // EXPECTED placeholder in cv/design.yaml, and RenderCV formats the date.
          ...(e.expected ? { date: e.end, expected: 'Expected' } : { start_date: e.start, end_date: e.end }),
          highlights: e.note ? [escapeMarkdown(e.note)] : [],
        })),
        projects: data.cv.projects.filter(entry => !entry.optional).map(entry => project(entry, works, facts)),
        open_source: openSource(data.contributions, profile.handle),
        experience: data.experience.map(x => ({
          company: escapeMarkdown(x.organisation), position: escapeMarkdown(x.role),
          start_date: x.start, end_date: x.end ?? 'present',
          ...(x.workplace === 'remote' ? { location: 'Remote' } : {}),
          highlights: x.highlights.map(escapeMarkdown),
        })),
        skills: skills(data.cv.skills, data.techs),
        // One closing section, "Languages & Writing", so the CV holds one page; RenderCV
        // title-cases the key like every other section title.
        ...(cvInterests.length ? { 'languages_&_writing': [languages, ...cvInterests] } : { languages: [languages] }),
      },
    },
    locale: { language: 'english' },
    settings: { current_date: facts.refreshedAt.slice(0, 10), bold_keywords: [], pdf_title: `${fullName(profile)} - CV` },
  };
}
