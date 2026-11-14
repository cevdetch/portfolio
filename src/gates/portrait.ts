import sharp from 'sharp';

export const portraitLimits = { minSize: 400, maxBytes: 200_000 } as const;

/**
 * What a published portrait must be: a square JPEG, large enough to print and small enough to serve, with no EXIF,
 * XMP or IPTC block, so no camera, date or GPS position travels with it.
 */
export async function checkPortrait(bytes: Uint8Array): Promise<string[]> {
  const errors: string[] = [];
  const meta = await sharp(bytes).metadata();
  if (meta.format !== 'jpeg') errors.push(`is ${meta.format}; a portrait must be a JPEG`);
  if (meta.width !== meta.height) errors.push(`is ${meta.width}x${meta.height}; a portrait must be square`);
  else if (meta.width < portraitLimits.minSize) errors.push(`is ${meta.width}x${meta.height}; a portrait must be at least ${portraitLimits.minSize} px`);
  if (bytes.length >= portraitLimits.maxBytes) errors.push(`weighs ${bytes.length} bytes; a portrait must stay under ${portraitLimits.maxBytes}`);
  if (meta.exif) errors.push('carries EXIF metadata');
  if (meta.xmp) errors.push('carries XMP metadata');
  if (meta.iptc) errors.push('carries IPTC metadata');
  return errors;
}
