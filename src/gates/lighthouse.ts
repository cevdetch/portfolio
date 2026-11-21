import type { BuildReceipt } from '../integrations/receipt.ts';

/** The origin Lighthouse audits. `pnpm lighthouse` builds with it as the site, so canonical URLs match the preview. */
export const previewOrigin = 'http://127.0.0.1:4390';

export const lighthousePasses = ['mobile', 'desktop', 'dark', 'dark-desktop'] as const;
export type LighthousePass = typeof lighthousePasses[number];
export interface Shard { index: number; count: number }

/** Every page the site owns, as the URLs Lighthouse visits, in path order: a new page is audited from its first build. */
export function lighthouseRoutes(receipt: Pick<BuildReceipt, 'site' | 'pages'>): string[] {
  if (new URL(receipt.site).origin !== previewOrigin) {
    throw new Error(`The build is for ${receipt.site}; build with --site ${previewOrigin}, as pnpm lighthouse does.`);
  }
  return receipt.pages.filter(page => page.owned).map(page => page.url).sort();
}

/** The i-th of n shards: every n-th route from the i-th, so each shard gets a spread of the site's page types. */
export function shardRoutes(routes: readonly string[], { index, count }: Shard): string[] {
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 1 || index > count) throw new Error(`Invalid shard ${index}/${count}.`);
  return routes.filter((_, at) => at % count === index - 1);
}

/** The passes and the shard a command line asks for; no pass names means every pass. */
export function lighthouseArgs(args: readonly string[]): { passes: LighthousePass[]; shard: Shard } {
  const rest = [...args];
  const at = rest.indexOf('--shard');
  const [index, count] = at >= 0 ? (rest.splice(at, 2)[1] ?? '').split('/').map(Number) : [1, 1];
  const unknown = rest.filter(name => !(lighthousePasses as readonly string[]).includes(name));
  if (unknown.length) throw new Error(`Unknown Lighthouse pass ${unknown.join(', ')}; the passes are ${lighthousePasses.join(', ')}.`);
  return { passes: rest.length ? rest as LighthousePass[] : [...lighthousePasses], shard: { index: index!, count: count! } };
}
