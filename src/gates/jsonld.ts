import { PROFILE_ID, WEBSITE_ID } from '../lib/jsonld.ts';

const checked = ['name', 'jobTitle', 'description'] as const;
const normalise = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();

/** Every claim JSON-LD makes about the Person or a Work must also be visible on the page, and every sameAs linked. */
export function checkJsonLd(blocks: readonly string[], visible: string, links: readonly string[]): string[] {
  const errors: string[] = [];
  const text = normalise(visible);
  const linked = new Set(links);
  blocks.forEach((block, index) => {
    let value: unknown;
    try { value = JSON.parse(block); } catch { errors.push(`JSON-LD block ${index} is not valid JSON`); return; }
    const graph = (value as { '@graph'?: unknown[] })['@graph'] ?? [value];
    for (const node of graph as Record<string, unknown>[]) {
      const id = String(node['@id'] ?? node['@type']);
      // The ProfilePage and WebSite names mirror the document title, not body text.
      if (id === PROFILE_ID || id === WEBSITE_ID) continue;
      for (const field of checked) {
        const claim = node[field];
        if (typeof claim === 'string' && !text.includes(normalise(claim))) errors.push(`${id} ${field} is not visible: "${claim}"`);
      }
      const sameAs = node['@type'] === 'Person' ? node['sameAs'] : undefined;
      for (const url of Array.isArray(sameAs) ? sameAs : typeof sameAs === 'string' ? [sameAs] : []) {
        if (!linked.has(String(url))) errors.push(`${id} sameAs is not linked on the page: "${String(url)}"`);
      }
    }
  });
  return errors;
}
