// `scripts/capture-screenshots.ts` is the only thing that touches the network or a browser; it writes
// one WebP per captured Work into `src/assets/screenshots/<slug>.webp`. The build stays offline and never
// fails when a file is missing: a page renders a screenshot only when `findScreenshot` finds one among
// the modules its own `import.meta.glob('/src/assets/screenshots/*.webp', { eager: true })` resolved.
export interface ScreenshotImage { src: string; width: number; height: number }
export type ScreenshotModules = Record<string, { default: ScreenshotImage }>;

/** Looks a Work's slug up among modules keyed the way a root-absolute `import.meta.glob` names them. */
export function findScreenshot(modules: ScreenshotModules, slug: string): ScreenshotImage | undefined {
  return modules[`/src/assets/screenshots/${slug}.webp`]?.default;
}

/** The one line of alt text a captured screenshot needs: no per-Work field to keep in sync. */
export function screenshotAlt(title: string): string {
  return `Home page of ${title}`;
}
