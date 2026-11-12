import { joinList } from '../lib/format.ts';
import type { Availability, Profile } from '../schemas/profile.ts';

// The capacity qualifies "employment" only: contract and freelance work are not part- or full-time.
export function availabilityLine(a: Availability, country: string): string {
  const openTo = a.openTo.map(item => item === 'employment' ? `${a.capacity} employment` : item);
  const workplace = a.workplace.map(item => item === 'local' ? 'on site' : item);
  return `Open to ${joinList(openTo, 'and')} work, ${joinList(workplace, 'or')} in ${country}. Replies ${a.reply}.`;
}

export type SocialNetwork = Profile['socials'][number]['network'];

export const socialLabels: Record<SocialNetwork, string> = { github: 'GitHub', linkedin: 'LinkedIn', npm: 'npm' };

/** The handle in a profile URL: its last path segment, without npm's `~`. */
export function socialUsername(url: string): string {
  const handle = new URL(url).pathname.split('/').filter(Boolean).at(-1)?.replace(/^~/, '');
  if (!handle) throw new Error(`${url} has no username in its path`);
  return handle;
}
