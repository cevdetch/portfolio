// `scripts/capture-screenshots.ts` runs on demand, like fetch-facts; never during the build. It writes
// lossless WebP masters at `src/assets/screenshots/<slug>/<device>-<scheme>.webp`, one per device and
// colour scheme, leaving out the dark one when a site has no dark theme. The build stays offline and
// never fails when files are missing: a page renders whichever devices `findScreenshots` finds among the
// modules its own `import.meta.glob('/src/assets/screenshots/*/*.webp', { eager: true })` resolved.

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

/** One device's masters: light is the base, dark only when the site has a dark theme. */
export interface DeviceScreenshots<T> { light: T; dark?: T }
export type WorkScreenshots<T> = Partial<Record<ScreenshotDevice, DeviceScreenshots<T>>>;

/** Groups a Work's masters, among modules keyed the way a root-absolute `import.meta.glob` names them,
 *  by device. A device with only a dark master is left out, because light is the base a page needs. */
export function findScreenshots<T>(modules: Readonly<Record<string, { default: T }>>, slug: string): WorkScreenshots<T> {
  const found: WorkScreenshots<T> = {};
  for (const device of Object.keys(screenshotDevices) as ScreenshotDevice[]) {
    const master = (scheme: ScreenshotScheme) => modules[`/src/assets/screenshots/${slug}/${device}-${scheme}.webp`]?.default;
    const light = master('light');
    if (light === undefined) continue;
    const dark = master('dark');
    found[device] = dark === undefined ? { light } : { light, dark };
  }
  return found;
}

/** The one line of alt text a device's screenshot needs: no per-Work field to keep in sync. */
export function screenshotAlt(title: string, device: ScreenshotDevice): string {
  return `Home page of ${title} on a ${device}`;
}

/** The `sizes` for a screenshot shown at most at its CSS width, and full width below it. */
export function screenshotSizes(cssWidth: number): string {
  return `(min-width: ${cssWidth}px) ${cssWidth}px, 100vw`;
}
