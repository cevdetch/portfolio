import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { stringify } from 'yaml';
import type { RenderCvDocument } from './model.ts';

// The Typst packages RenderCV's template imports, vendored so a render never downloads.
export const typstPackages = resolve('cv/typst-packages');

// Typst looks for packages it would download in $XDG_CACHE_HOME/typst/packages, so each
// render gets a throwaway cache whose packages directory is the vendored copy.
export async function runRenderCv(args: readonly string[], cwd: string, command = 'rendercv', packages = typstPackages): Promise<void> {
  const cache = await mkdtemp(join(tmpdir(), 'portfolio-typst-'));
  try {
    await mkdir(join(cache, 'typst'));
    await symlink(packages, join(cache, 'typst', 'packages'), 'dir');
    await spawnRenderCv(args, cwd, command, { ...process.env, XDG_CACHE_HOME: cache });
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
}

function spawnRenderCv(args: readonly string[], cwd: string, command: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    child.once('error', error => reject((error as NodeJS.ErrnoException).code === 'ENOENT'
      ? new Error('rendercv not found; run pip install -r requirements.txt') : error));
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`rendercv exited with ${code}:\n${log}`)));
  });
}

/**
 * RenderCV resolves `cv.photo` against the model's folder, so the portrait is copied next to it; pnpm cv:private
 * renders the same model and finds it there too. Returns the file name to put in the model, or undefined when
 * there is no portrait, and the CV prints without one.
 */
export async function placePhoto(source: string, workDir: string): Promise<string | undefined> {
  await mkdir(workDir, { recursive: true });
  try {
    await copyFile(source, join(workDir, basename(source)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return basename(source);
}

export async function renderCvPdf(doc: RenderCvDocument, options: { workDir: string; design: string; output: string }) {
  await mkdir(options.workDir, { recursive: true });
  const input = join(options.workDir, 'cv.yaml');
  await writeFile(input, stringify(doc));
  await runRenderCv(['render', input, '--design', options.design, '--pdf-path', options.output, '-nomd', '-nohtml', '-nopng'], options.workDir);
  return readFile(options.output);
}
