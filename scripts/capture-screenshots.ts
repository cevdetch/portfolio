// Captures one screenshot per live Work site, committed and refreshed on demand (not on every build).
// Runs on demand, like fetch-facts; never during the build: the Astro build stays offline, and a page
// renders a screenshot only when `src/data/screenshots.ts` finds the file this script wrote.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { readWorkSources } from './fetch-facts.ts';

const root = new URL('../', import.meta.url);
const viewport = { width: 1280, height: 800 };

export function chromeArgs(userDataDir: string): string[] {
  return [
    '--headless=new',
    '--hide-scrollbars',
    `--window-size=${viewport.width},${viewport.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-extensions',
    '--disable-component-update',
    '--disable-features=Translate',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];
}

/** Chrome/Brave print this line to stderr once the DevTools endpoint is ready. */
export function devtoolsUrl(stderr: string): string | undefined {
  return stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
}

interface CdpMessage {
  id?: number; method?: string;
  params?: { type?: string; response?: { status: number } };
  result?: { data?: string }; error?: { message: string };
}

/** Races `promise` against a timeout, but always clears the timer once either settles, so a resolved
 *  or rejected call never leaves a timer (and the process it would keep alive) behind. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

/** One CDP call, bounded by its own timeout and rejected if the socket closes before a reply arrives,
 *  so a dead connection cannot hang the caller, or leak its entry in `pending`, forever. */
export function send(ws: WebSocket, pending: Map<number, (message: CdpMessage) => void>, counter: { next: number },
  method: string, params: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<CdpMessage> {
  const id = counter.next++;
  return new Promise<CdpMessage>((resolve, reject) => {
    const cleanup = () => { pending.delete(id); ws.removeEventListener('close', onClose); clearTimeout(timer); };
    const onClose = () => { cleanup(); reject(new Error(`DevTools socket closed before a reply to ${method}`)); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`timed out waiting for a reply to ${method}`)); }, timeoutMs);
    pending.set(id, message => { cleanup(); resolve(message); });
    ws.addEventListener('close', onClose, { once: true });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/** The main frame's own document response, last if a redirect chain produced several, so the final
 *  status is the one that decides whether the site loaded. */
export function mainDocumentStatus(responses: readonly { type: string; status: number }[]): number | undefined {
  return [...responses].reverse().find(response => response.type === 'Document')?.status;
}

/** Kills the whole process group the browser's spawn started, not just the top-level PID. Chromium
 *  launches a zygote host and helper processes (GPU, crashpad, network service, renderers); SIGKILL to
 *  the main process alone leaves them running long enough to recreate files in the throwaway profile
 *  directory after it has already been removed. `detached: true` on spawn makes the browser the leader
 *  of its own process group, so the negative PID here reaches every descendant that hasn't changed its
 *  own group. */
function killBrowser(proc: ReturnType<typeof spawn>): void {
  try {
    if (proc.pid !== undefined) process.kill(-proc.pid, 'SIGKILL');
    else proc.kill('SIGKILL');
  } catch {
    proc.kill('SIGKILL');
  }
}

/** Spawns the browser and waits for its DevTools line. Kills its own child before rejecting, so a caller
 *  that never receives `proc` back (because this failed) has nothing left to clean up. */
export async function launchBrowser(chromePath: string, userDataDir: string) {
  const proc = spawn(chromePath, chromeArgs(userDataDir), { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  try {
    const browserWsUrl = await withTimeout(new Promise<string>((resolve, reject) => {
      let buffer = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const url = devtoolsUrl(buffer);
        if (url) resolve(url);
      });
      proc.once('exit', code => reject(new Error(`browser exited before it was ready (code ${code})`)));
      proc.once('error', reject);
    }), 15_000, 'timed out waiting for the browser to start');
    return { proc, browserWsUrl };
  } catch (error) {
    killBrowser(proc);
    throw error;
  }
}

async function captureViaCdp(browserWsUrl: string, url: string): Promise<Buffer> {
  const base = browserWsUrl.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, '');
  const response = await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`could not open a tab for ${url}: HTTP ${response.status}`);
  const target = await response.json() as { webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map<number, (message: CdpMessage) => void>();
  const counter = { next: 1 };
  const events: string[] = [];
  const responses: { type: string; status: number }[] = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data as string) as CdpMessage;
    if (message.id !== undefined && pending.has(message.id)) { pending.get(message.id)!(message); pending.delete(message.id); }
    else if (message.method === 'Network.responseReceived' && message.params?.response) {
      responses.push({ type: message.params.type ?? '', status: message.params.response.status });
    } else if (message.method) events.push(message.method);
  });
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('DevTools socket error')));
    }), 10_000, 'timed out opening the DevTools socket');
    await send(ws, pending, counter, 'Network.enable');
    await send(ws, pending, counter, 'Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
    await send(ws, pending, counter, 'Page.enable');
    // Headless page-load signals can be missed by a listener attached after navigation starts; a bounded
    // wait with a fallback keeps a slow or already-loaded page from hanging the capture. Both timers are
    // cleared on whichever path wins, so a fast load doesn't leave the 15s fallback running behind it.
    await new Promise<void>(resolve => {
      const timer = setInterval(() => { if (events.includes('Page.loadEventFired')) { clearInterval(timer); clearTimeout(fallback); resolve(); } }, 100);
      const fallback = setTimeout(() => { clearInterval(timer); resolve(); }, 15_000);
    });
    const status = mainDocumentStatus(responses);
    if (status !== undefined && status >= 400) throw new Error(`main document returned HTTP ${status} for ${url}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    const shot = await send(ws, pending, counter, 'Page.captureScreenshot', { format: 'png' }, 20_000);
    if (!shot.result?.data) throw new Error(`no screenshot data: ${shot.error?.message ?? 'unknown error'}`);
    return Buffer.from(shot.result.data, 'base64');
  } finally {
    ws.close();
  }
}

export async function captureScreenshot(chromePath: string, url: string): Promise<Buffer> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'capture-screenshots-'));
  // One outer cleanup covers every way the steps below can fail: a `launchBrowser` timeout or exit kills
  // its own child before rejecting (see above), so `proc` here stays undefined and only the profile
  // directory needs removing; once launched, both the process and the directory need to go.
  let proc: ReturnType<typeof spawn> | undefined;
  try {
    const launched = await launchBrowser(chromePath, userDataDir);
    proc = launched.proc;
    return await captureViaCdp(launched.browserWsUrl, url);
  } finally {
    if (proc) killBrowser(proc);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const chromePath = process.env['CHROME_PATH'] ?? 'google-chrome';
  const sources = await readWorkSources(new URL('src/content/work/', root));
  const targets = sources.filter((source): source is typeof source & { site: string } => source.site !== undefined);
  const dir = new URL('src/assets/screenshots/', root);
  await mkdir(dir, { recursive: true });
  let failures = 0;
  for (const target of targets) {
    try {
      const png = await captureScreenshot(chromePath, target.site);
      const webp = await sharp(png).webp({ quality: 82 }).toBuffer();
      await writeFile(new URL(`${target.id}.webp`, dir), webp);
      console.log(`${target.id}: captured ${webp.byteLength} bytes from ${target.site}`);
    } catch (error) {
      failures += 1;
      console.error(`${target.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (failures) process.exitCode = 1;
  else console.log(`Captured ${targets.length} screenshot${targets.length === 1 ? '' : 's'}.`);
}
