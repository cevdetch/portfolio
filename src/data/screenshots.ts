// `scripts/capture-screenshots.ts` runs on demand, like fetch-facts; never during the build. It writes
// one WebP per captured Work into `src/assets/screenshots/<slug>.webp`. The build stays offline and never
// fails when a file is missing: a page renders a screenshot only when `findScreenshot` finds one among
// the modules its own `import.meta.glob('/src/assets/screenshots/*.webp', { eager: true })` resolved.

/** The two devices each Work's site is captured on, in CSS pixels; the masters are `screenshotScale` times
 *  larger. `widths` are the sizes the build derives from a master for the page's `srcset`. */
export const screenshotDevices = {
  desktop: { width: 1280, height: 800, mobile: false, widths: [640, 1280, 2560] },
  phone: { width: 390, height: 844, mobile: true, widths: [390, 780] },
} as const;
export type ScreenshotDevice = keyof typeof screenshotDevices;
export const screenshotSchemes = ['light', 'dark'] as const;
export type ScreenshotScheme = typeof screenshotSchemes[number];
/** Device pixel ratio of every capture. */
export const screenshotScale = 2;

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
