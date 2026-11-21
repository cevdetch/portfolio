/** The built routes a Lighthouse config never visits. The gate covers every page, each Work and the 404 included. */
export function unauditedRoutes(configUrls: readonly string[], routes: readonly string[]): string[] {
  const audited = new Set(configUrls.map(url => new URL(url).pathname));
  return routes.filter(route => !audited.has(route));
}
