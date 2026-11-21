// The Lighthouse gate: both form factors, each in the light scheme and then in the dark one, which Chrome
// reports to the page under --force-dark-mode. Every pass runs before the exit code reports the failures,
// so one red pass never hides the next.
import { spawnSync } from 'node:child_process';

const passes = (['mobile', 'desktop'] as const).flatMap(device => [
  { name: device, flags: [] as string[] },
  { name: `${device} dark`, flags: ['--collect.settings.chromeFlags=--force-dark-mode', `--upload.outputDir=.lighthouseci/${device}-dark`] },
].map(pass => ({ ...pass, args: ['exec', 'lhci', 'autorun', `--config=lighthouse/${device}.json`, ...pass.flags] })));

const failed = passes.filter(pass => {
  console.log(`\nLighthouse, ${pass.name}`);
  return spawnSync('pnpm', pass.args, { stdio: 'inherit' }).status !== 0;
});
if (failed.length) {
  console.error(`\nLighthouse failed: ${failed.map(pass => pass.name).join(', ')}`);
  process.exitCode = 1;
}
