import { access, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { runRenderCv } from '../src/cv/render.ts';

export function privateOverrides(env: Record<string, string | undefined>): string[] {
  const phone = env['CV_PHONE']?.trim();
  if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error('CV_PHONE must be E.164, e.g. +41791234567.');
  const fields: [string, string][] = [
    ['--cv.name', 'CV_NAME'], ['--cv.phone', 'CV_PHONE'], ['--cv.location', 'CV_LOCATION'],
    ['--cv.sections.education.0.location', 'CV_EDUCATION_LOCATION'],
  ];
  return fields.flatMap(([flag, key]) => {
    const value = env[key]?.trim();
    return value ? [flag, value] : [];
  });
}

if (import.meta.main) {
  try {
    const model = resolve('.astro/cv/cv.yaml');
    await access(model).catch(() => { throw new Error('No CV model; run pnpm build first.'); });
    const envFile = resolve(process.argv[2] ?? 'cv.private.env');
    const overrides = privateOverrides(parseEnv(await readFile(envFile, 'utf8')));
    // Every output, the Typst source included, stays in the gitignored private/ folder.
    const folder = resolve('private');
    await mkdir(folder, { recursive: true });
    const output = resolve(folder, 'cv-full.pdf');
    await runRenderCv(['render', model, '--design', resolve('cv/design.yaml'), '--output-folder', folder,
      '--typst-path', resolve(folder, 'cv-full.typ'), '--pdf-path', output, '-nomd', '-nohtml', '-nopng', ...overrides], resolve('.astro/cv'));
    console.log(`Full CV written to ${output}; it is gitignored and never published.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
