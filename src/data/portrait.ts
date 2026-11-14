import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

// `scripts/prepare-portrait.ts` runs on demand, like capture-screenshots; never during the build. It writes three
// copies of the portrait, all square sRGB JPEGs with no metadata, and the build never needs the originals.
// The build degrades without them: the Person carries no image, /about/ shows none and the CV prints none.

export const portraitFile = 'cevdet-haran.jpg';
/** The stable URL the Person's image names, `https://cevdet.ch/cevdet-haran.jpg`. */
export const publicPortraitPath = `public/${portraitFile}`;

/** Every committed copy: which original it comes from and its edge in pixels. */
export const portraitOutputs = [
  { path: publicPortraitPath, source: 'web', size: 1200 },
  // The master /about/ derives its <picture> from through astro:assets.
  { path: `src/assets/portrait/${portraitFile}`, source: 'web', size: 1200 },
  // The tighter crop RenderCV prints in the CV header.
  { path: `cv/${portraitFile}`, source: 'cv', size: 600 },
] as const;

export function portraitUrl(website: string): string {
  return new URL(portraitFile, website).href;
}

/** The portrait's dimensions, read from the file; undefined when it is missing. */
export async function readPortraitSize(input: string | Buffer): Promise<{ width: number; height: number } | undefined> {
  const bytes = typeof input === 'string' ? await readFile(input).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }) : input;
  if (!bytes) return undefined;
  const { width, height } = await sharp(bytes).metadata();
  return { width, height };
}
