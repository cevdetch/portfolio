import { joinList } from '../lib/format.ts';
import type { Education } from '../schemas/background.ts';
import type { Availability, Profile } from '../schemas/profile.ts';

// Without weekly hours, the capacity qualifies "employment" only: contract and freelance work are not part- or
// full-time. Weekly hours bound every kind of work, so they lead the line instead.
export function availabilityLine(a: Availability, country: string): string {
  const capacity = a.hoursPerWeek === undefined ? '' : `${a.capacity.charAt(0).toUpperCase()}${a.capacity.slice(1)}, up to ${a.hoursPerWeek} hours a week. `;
  const openTo = a.openTo.map(item => item === 'employment' && !capacity ? `${a.capacity} employment` : item);
  const workplace = a.workplace.map(item => item === 'local' ? 'on site' : item);
  return `${capacity}Open to ${joinList(openTo, 'and')} work, ${joinList(workplace, 'or')} in ${country}.`;
}

// Tokens the bio may hold, each filled from Education.
const bioTokens = new Map<string, { fill: (education: readonly Education[]) => string | undefined; needs: string }>([
  ['graduationYear', {
    fill: education => {
      const expected = education.filter(entry => entry.expected);
      return expected.length === 1 ? expected[0]!.end.slice(0, 4) : undefined;
    },
    needs: 'exactly one expected Education entry',
  }],
]);

/** Replaces each `{token}` in the bio with its value from Education; `problems` lists what could not be filled. */
export function fillBio(text: string, education: readonly Education[]): { text: string; problems: string[] } {
  const problems: string[] = [];
  const filled = text.replace(/\{(\w+)\}/g, (token, name: string) => {
    const entry = bioTokens.get(name);
    if (!entry) { problems.push(`unknown token ${token}`); return token; }
    const value = entry.fill(education);
    if (value === undefined) { problems.push(`${token} needs ${entry.needs}`); return token; }
    return value;
  });
  return { text: filled, problems };
}

// The full name is published; the CV header, the home h1 and title, /about/ and the JSON-LD
// Person all derive it from here, so it stays one decision.
export function fullName(profile: Pick<Profile, 'name' | 'familyName'>): string {
  return `${profile.name} ${profile.familyName}`;
}

/** "Turkish (Native)" style: the one language-display format for the CV and /about/. */
export function languageItem(language: Pick<Profile['languages'][number], 'name' | 'level'>): string {
  const level = language.level === 'native' ? 'Native' : language.level;
  return `${language.name} (${level})`;
}

export type SocialNetwork = Profile['socials'][number]['network'];

export const socialLabels: Record<SocialNetwork, string> = { github: 'GitHub', linkedin: 'LinkedIn', npm: 'npm' };

/** The handle in a profile URL: its last path segment, without npm's `~`. */
export function socialUsername(url: string): string {
  const handle = new URL(url).pathname.split('/').filter(Boolean).at(-1)?.replace(/^~/, '');
  if (!handle) throw new Error(`${url} has no username in its path`);
  return handle;
}
