const urls = import.meta.glob<string>('../facts/icons/*.svg', { eager: true, query: '?url', import: 'default' });

/** Snapshot icon file (icons/<slug>.svg) → built asset URL. */
export function iconUrl(file: string | undefined): string | undefined {
  return file ? urls[`../facts/${file}`] : undefined;
}
