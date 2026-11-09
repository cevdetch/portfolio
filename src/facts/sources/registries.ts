import type { PackageFacts } from '../schema.ts';

export interface NpmDoc { 'dist-tags': { latest?: string }; time: Record<string, string> }
export interface AurInfo { resultcount: number; results: { Name: string; Version: string; LastModified: number }[] }

export function toNpmFacts(name: string, doc: NpmDoc | null): PackageFacts {
  const version = doc?.['dist-tags'].latest;
  if (!doc || !version) return { registry: 'npm', name, published: false };
  const releasedAt = doc.time[version];
  if (!releasedAt) throw new Error(`npm ${name}: no release time for ${version}`);
  return { registry: 'npm', name, published: true, version, releasedAt, url: `https://www.npmjs.com/package/${name}` };
}

export function toAurFacts(name: string, info: AurInfo): PackageFacts {
  const found = info.results.find(result => result.Name === name);
  if (!found) return { registry: 'aur', name, published: false };
  return {
    registry: 'aur', name, published: true, version: found.Version,
    releasedAt: new Date(found.LastModified * 1000).toISOString(),
    url: `https://aur.archlinux.org/packages/${name}`,
  };
}
