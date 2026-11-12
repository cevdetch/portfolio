import type { LoadedPortfolio } from '../data/portfolio.ts';
import { availabilityLine, socialUsername } from '../data/profile.ts';
import { contributionTotals, featuredWorks, upstreamGroups, type UpstreamGroup } from '../data/views.ts';
import type { WorkFacts } from '../facts/schema.ts';
import type { WorkEntry } from '../data/validate.ts';
import { joinList } from '../lib/format.ts';
import type { Profile } from '../schemas/profile.ts';
import { techCategories, type Tech, type TechCategory } from '../schemas/tech.ts';

type Entry = Record<string, string | readonly string[]>;
export interface RenderCvDocument {
  cv: {
    name: string; headline: string; email: string; website: string;
    social_networks: { network: 'LinkedIn' | 'GitHub'; username: string }[];
    sections: Record<string, readonly (string | Entry)[]> & { projects: Entry[]; education: Entry[]; skills: Entry[] };
  };
  locale: { language: 'english' };
  settings: { current_date: string; bold_keywords: string[]; pdf_title: string };
}

/** Story is plain text; RenderCV reads inline Markdown, so escape it. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]]/g, match => `\\${match}`);
}

export function languagesLine(languages: Profile['languages']): string {
  const byLevel = new Map<string, string[]>();
  for (const { name, level } of languages) byLevel.set(level, [...(byLevel.get(level) ?? []), escapeMarkdown(name)]);
  return [...byLevel].map(([level, names]) => `**${names.join(', ')}** ${level}`).join(' · ');
}

export function contributionLine(groups: readonly UpstreamGroup[], top = 5): string {
  const { pulls, upstreams } = contributionTotals(groups);
  const named = groups.slice(0, top).map(group => escapeMarkdown(group.pulls.length > 1 ? `${group.repo} (${group.pulls.length})` : group.repo));
  return `${pulls} merged pull requests to ${upstreams} upstream projects, including ${joinList(named, 'and')}.`;
}

// RenderCV's own network names, in header order; it has no npm network, so npm stays off the CV.
const cvNetworks = [['linkedin', 'LinkedIn'], ['github', 'GitHub']] as const;

export function socialNetworks(socials: Profile['socials']): RenderCvDocument['cv']['social_networks'] {
  return cvNetworks.flatMap(([network, name]) => {
    const social = socials.find(item => item.network === network);
    return social ? [{ network: name, username: socialUsername(social.url) }] : [];
  });
}

function project(work: WorkEntry, facts: WorkFacts | undefined): Entry {
  const { data } = work;
  const link = data.repo ? `https://github.com/${data.repo}` : data.site;
  const ongoing = data.status === 'active' || data.status === 'maintained';
  const title = escapeMarkdown(data.title);
  return {
    name: link ? `[${title}](${link})` : title,
    ...(facts?.repo ? { start_date: facts.repo.firstCommit.slice(0, 7), end_date: ongoing ? 'present' : facts.repo.lastCommit.slice(0, 7) } : {}),
    summary: data.site && data.repo ? `${escapeMarkdown(data.summary)} [Live site](${data.site})` : escapeMarkdown(data.summary),
    highlights: data.highlights.map(escapeMarkdown),
  };
}

function skills(techs: readonly Tech[]): Entry[] {
  return (Object.keys(techCategories) as TechCategory[])
    .filter(category => techCategories[category].cv)
    .map(category => ({ label: techCategories[category].label, details: techs.filter(t => t.category === category).map(t => escapeMarkdown(t.label)).join(', ') }))
    .filter(entry => entry.details);
}

export function buildCv(data: LoadedPortfolio): RenderCvDocument {
  const { profile, facts } = data;
  return {
    cv: {
      name: profile.name,
      headline: profile.jobTitle,
      email: profile.email,
      website: profile.website,
      social_networks: socialNetworks(profile.socials),
      sections: {
        summary: [escapeMarkdown(profile.bio)],
        availability: [availabilityLine(profile.availability)],
        // A student profile: education sits above experience.
        education: data.education.map(e => ({
          institution: escapeMarkdown(e.institution), degree: escapeMarkdown(e.credential),
          ...(e.field ? { area: escapeMarkdown(e.field) } : {}),
          start_date: e.start, end_date: e.end, highlights: e.note ? [escapeMarkdown(e.note)] : [],
        })),
        experience: data.experience.map(x => ({
          company: escapeMarkdown(x.organisation), position: escapeMarkdown(x.role),
          start_date: x.start, end_date: x.end ?? 'present',
          ...(x.workplace === 'remote' ? { location: 'Remote' } : {}),
          highlights: x.highlights.map(escapeMarkdown),
        })),
        projects: featuredWorks(data.works).map(work => project(work, facts.works[work.id])),
        open_source: [contributionLine(upstreamGroups(facts.contributions, data.contributions))],
        skills: skills(data.techs),
        languages: [languagesLine(profile.languages)],
        ...(profile.interests.length ? { interests: profile.interests.map(i => ({ label: escapeMarkdown(i.label), details: escapeMarkdown(i.details) })) } : {}),
      },
    },
    locale: { language: 'english' },
    settings: { current_date: facts.refreshedAt.slice(0, 10), bold_keywords: [], pdf_title: `${profile.name} - CV` },
  };
}
