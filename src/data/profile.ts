import { joinList } from '../lib/format.ts';
import type { Availability, Profile } from '../schemas/profile.ts';

export function availabilityLine(a: Availability): string {
  const capacity = a.capacity === 'part-time' ? 'Part-time' : 'Full-time';
  return `${capacity}; open to ${joinList(a.openTo, 'and')} work, ${joinList(a.workplace, 'or')}. Time zone ${a.timeZone}; replies ${a.reply}.`;
}

export type SocialNetwork = Profile['socials'][number]['network'];

export const socialLabels: Record<SocialNetwork, string> = { github: 'GitHub', linkedin: 'LinkedIn', npm: 'npm' };

/** The handle in a profile URL: its last path segment, without npm's `~`. */
export function socialUsername(url: string): string {
  const handle = new URL(url).pathname.split('/').filter(Boolean).at(-1)?.replace(/^~/, '');
  if (!handle) throw new Error(`${url} has no username in its path`);
  return handle;
}
