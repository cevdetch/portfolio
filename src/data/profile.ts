import type { Profile } from '../schemas/profile.ts';

export type SocialNetwork = Profile['socials'][number]['network'];

export const socialLabels: Record<SocialNetwork, string> = { github: 'GitHub', linkedin: 'LinkedIn', npm: 'npm' };
