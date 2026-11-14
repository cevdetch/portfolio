import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { portraitOutputs } from '../src/data/portrait.ts';

// Runs on demand: `pnpm prepare-portrait <web-source> <cv-source>`. The outputs are committed; the build never needs
// the originals.

/**
 * A square, sRGB, progressive mozjpeg JPEG of `size` pixels. sharp writes no metadata unless asked, so EXIF, XMP, IPTC
 * and the source's ICC profile all stay behind; the pixels are converted to sRGB first, which a JPEG without a
 * profile is read as.
 */
export function preparePortrait(input: string | Buffer, size: number): Promise<Buffer> {
  return sharp(input).rotate().resize(size, size, { fit: 'cover' }).toColourspace('srgb')
    .jpeg({ mozjpeg: true, progressive: true, quality: 82 }).toBuffer();
}

if (import.meta.main) {
  try {
    const [web, cv] = process.argv.slice(2);
    if (!web || !cv) throw new Error('Usage: pnpm prepare-portrait <web-source> <cv-source>');
    const sources = { web, cv };
    for (const output of portraitOutputs) {
      const bytes = await preparePortrait(resolve(sources[output.source]), output.size);
      await mkdir(dirname(output.path), { recursive: true });
      await writeFile(output.path, bytes);
      console.log(`${output.path}: ${output.size}x${output.size}, ${bytes.length} bytes`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
