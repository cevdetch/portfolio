// The Lighthouse gate: 100 in every category it asserts. Each pass measures what can change there, as often as it
// varies, on every page the build owns:
//   mobile        all four categories, median of five runs: performance on a throttled phone is the one noisy
//                 measurement;
//   desktop       all four categories, one run: desktop scores sit far from every threshold;
//   dark,         accessibility, one run each: a colour scheme changes contrast and nothing else, and the
//   dark-desktop  accessibility audits give the same answer every run.
// Every pass runs before the exit code reports the failures. `--shard i/n` audits every n-th page from the i-th,
// so CI can split a pass across parallel jobs.
//   node scripts/lighthouse.ts [pass ...] [--shard i/n]
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { lighthouseArgs, lighthouseRoutes, shardRoutes, type LighthousePass } from '../src/gates/lighthouse.ts';
import { readBuildReceipt } from '../src/integrations/receipt.ts';

const configs: Record<LighthousePass, { config: string; flags: string[] }> = {
  mobile: { config: 'mobile', flags: [] },
  desktop: { config: 'desktop', flags: [] },
  dark: { config: 'dark', flags: [] },
  'dark-desktop': { config: 'dark', flags: ['--collect.settings.preset=desktop'] },
};

if (import.meta.main) {
  try {
    const { passes, shard } = lighthouseArgs(process.argv.slice(2));
    const routes = shardRoutes(lighthouseRoutes(await readBuildReceipt(pathToFileURL(`${process.cwd()}/`))), shard);
    const suffix = shard.count > 1 ? `-${shard.index}of${shard.count}` : '';
    const failed = passes.filter(pass => {
      const { config, flags } = configs[pass];
      console.log(`\nLighthouse, ${pass}${suffix && `, shard ${shard.index} of ${shard.count}`}: ${routes.length} pages`);
      const args = ['exec', 'lhci', 'autorun', `--config=lighthouse/${config}.json`, ...flags,
        ...routes.map(url => `--collect.url=${url}`), `--upload.outputDir=.lighthouseci/${pass}${suffix}`];
      return spawnSync('pnpm', args, { stdio: 'inherit' }).status !== 0;
    });
    if (failed.length) {
      console.error(`\nLighthouse failed: ${failed.join(', ')}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
