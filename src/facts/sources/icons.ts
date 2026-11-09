const forbidden: readonly [RegExp, string][] = [
  [/<(?:[\w-]+:)?script\b/i, 'script element'],
  [/<(?:[\w-]+:)?foreignObject\b/i, 'foreignObject element'],
  [/\son[a-z]+\s*=/i, 'event handler attribute'],
  [/\s(?:xlink:)?href\s*=\s*["']\s*(?!#)/i, 'external reference'],
  [/<!ENTITY/i, 'entity declaration'],
];

/** Problems that keep a fetched /icon.svg out of the Snapshot: it must be a small, self-contained SVG. */
export function checkSvg(text: string): string[] {
  const problems = forbidden.filter(([pattern]) => pattern.test(text)).map(([, what]) => what);
  if (!/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) problems.push('not an SVG document');
  if (new TextEncoder().encode(text).length > 65_536) problems.push('larger than 64 KiB');
  return problems;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
