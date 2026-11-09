import { GITHUB_API } from './sources/github.ts';

export interface Client {
  json<T>(url: string): Promise<{ data: T; headers: Headers } | null>;
  text(url: string): Promise<{ body: string; contentType: string } | null>;
}

/** 404 is a Fact (unpublished, no icon, no release); every other failure stops the refresh. */
export function createClient(token: string | undefined, fetcher: typeof fetch = fetch): Client {
  async function get(url: string): Promise<Response | null> {
    // Exact origin: a prefix match would also accept https://api.github.com.example.test.
    const github = new URL(url).origin === new URL(GITHUB_API).origin;
    const headers: Record<string, string> = { 'User-Agent': 'cevdet.ch-fetch-facts' };
    if (github) headers['Accept'] = 'application/vnd.github+json';
    if (github && token) headers['Authorization'] = `Bearer ${token}`;
    const redirect = github ? 'manual' : 'follow';
    let currentUrl = url;
    let hops = 0;
    const maxHops = 5;
    for (;;) {
      const response = await fetcher(currentUrl, { headers, redirect });
      if (response.status === 404) return null;
      if (response.status >= 300 && response.status < 400) {
        if (!github) throw new Error(`Unexpected redirect for non-GitHub URL ${currentUrl}`);
        const location = response.headers.get('location');
        if (!location) throw new Error(`${currentUrl}: HTTP ${response.status} without Location header`);
        const nextUrl = new URL(location, currentUrl).href;
        const nextOrigin = new URL(nextUrl).origin;
        if (nextOrigin !== new URL(GITHUB_API).origin) {
          throw new Error(`${currentUrl}: redirect to ${nextUrl} leaves api.github.com`);
        }
        if (hops >= maxHops) throw new Error(`${currentUrl}: too many redirects`);
        currentUrl = nextUrl;
        hops++;
        continue;
      }
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response;
    }
  }
  return {
    async json<T>(url: string) {
      const response = await get(url);
      return response && { data: await response.json() as T, headers: response.headers };
    },
    async text(url: string) {
      const response = await get(url);
      return response && { body: await response.text(), contentType: response.headers.get('content-type') ?? '' };
    },
  };
}
