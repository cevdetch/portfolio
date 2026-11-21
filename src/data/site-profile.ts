import { parse } from 'yaml';
import profileYaml from '../content/profile.yaml?raw';
import type { Profile } from '../schemas/profile.ts';

/**
 * The profile fields the site header, the footer and the 404 page title need, read straight from profile.yaml: they
 * render where the content collections are unavailable, so they cannot use loadPortfolio. loadPortfolio still
 * validates the file.
 */
export const siteProfile = parse(profileYaml) as Pick<Profile,
  'name' | 'familyName' | 'jobTitle' | 'email' | 'contactSubject' | 'socials' | 'country' | 'availability'>;
