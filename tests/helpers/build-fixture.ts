import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

interface BuildResult { code: number; log: string; outDir: URL }
interface BuildFixture {
  root: URL;
  build(args?: readonly string[], env?: Readonly<Record<string, string>>): Promise<BuildResult>;
  cleanup(): Promise<void>;
}

const projects = new URL('../../.astro/test-projects/', import.meta.url);
const astroManifest = new URL(import.meta.resolve('astro/package.json'));
const manifest = JSON.parse(await readFile(astroManifest, 'utf8')) as { bin: { astro: string } };
const astroBin = fileURLToPath(new URL(manifest.bin.astro, astroManifest));
const fixtureFont = fileURLToPath(new URL('../../src/assets/social-fonts/NotoSans-Regular.ttf', import.meta.url));

export async function createBuildFixture(input: {
  configSource: string;
  pages: Readonly<Record<string, string>>;
  publicFiles?: Readonly<Record<string, string | Uint8Array>>;
}): Promise<BuildFixture> {
  await mkdir(projects, { recursive: true });
  const root = pathToFileURL(`${await mkdtemp(fileURLToPath(new URL('fixture-', projects)))}/`);
  const put = async (name: string, content: string | Uint8Array) => {
    const path = fileURLToPath(new URL(name, root));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  };
  try {
    await put('package.json', '{"type":"module"}\n');
    await put('fixture.config.mjs', input.configSource);
    // Layout.astro preloads the site's --font-archivo family. Fixtures register it from a committed font file
    // with the local provider, so no fixture build reaches the network for the Google download.
    await put('astro.config.mjs', `
import { fontProviders, mergeConfig } from 'astro/config';
import { writeFile } from 'node:fs/promises';
import config from './fixture.config.mjs';
export default mergeConfig(config, {
  fonts: [{
    provider: fontProviders.local(), name: 'Archivo', cssVariable: '--font-archivo', fallbacks: ['sans-serif'],
    options: { variants: [{ src: [${JSON.stringify(fixtureFont)}], weight: 400, style: 'normal' }] },
  }],
  integrations: [{
    name: 'test:output-directory',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        await writeFile(new URL('output-url.txt', import.meta.url), dir.href);
      },
    },
  }],
});
`);
    for (const [name, content] of Object.entries(input.pages)) await put(`src/pages/${name}`, content);
    for (const [name, content] of Object.entries(input.publicFiles ?? {})) await put(`public/${name}`, content);
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return {
    root,
    async build(args = [], env = {}) {
      const outputUrl = new URL('output-url.txt', root);
      await rm(outputUrl, { force: true });
      const logUrl = new URL('build.log', root);
      const output = await open(logUrl, 'w');
      const inherited = { ...process.env };
      delete inherited['SITE_NOINDEX'];
      let code: number;
      try {
        code = await new Promise<number>((resolve, reject) => {
          const child = spawn(process.execPath,
            [astroBin, 'build', '--root', '.', '--config', 'astro.config.mjs', ...args], {
              cwd: root,
              env: { ...inherited, ...env, ASTRO_TELEMETRY_DISABLED: '1' },
              stdio: ['ignore', output.fd, output.fd],
            });
          child.once('error', reject);
          child.once('close', (status, signal) => {
            if (status === null) reject(new Error(`Fixture build ended with signal ${signal}.`));
            else resolve(status);
          });
        });
      } finally {
        await output.close();
      }
      const log = await readFile(logUrl, 'utf8');
      const outDir = code === 0
        ? new URL(await readFile(outputUrl, 'utf8'))
        : new URL('dist/', root);
      return { code, log, outDir };
    },
    async cleanup() { await rm(root, { recursive: true, force: true }); },
  };
}
