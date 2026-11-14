// Captures the first screen of every live Work site on a desktop and a phone, each in the light and the
// dark colour scheme, at device pixel ratio 2, and commits them as lossless WebP masters at
// `src/assets/screenshots/<slug>/<device>-<scheme>.webp`. Runs on demand, like fetch-facts; never during
// the build: the Astro build stays offline, and a page renders only the variants
// `src/data/screenshots.ts` finds among the files this script wrote.
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import {
  screenshotDevices, screenshotScale, screenshotSchemes, type ScreenshotDevice, type ScreenshotScheme,
} from '../src/data/screenshots.ts';
import { readWorkSources } from './fetch-facts.ts';

const root = new URL('../', import.meta.url);
const viewport = screenshotDevices.desktop;

export interface CaptureVariant {
  device: ScreenshotDevice; scheme: ScreenshotScheme; width: number; height: number; mobile: boolean;
}

/** Every device × scheme pair, light before dark, so a device's dark capture can be compared with its light one. */
export function captureVariants(): CaptureVariant[] {
  return (Object.keys(screenshotDevices) as ScreenshotDevice[]).flatMap(device => {
    const { width, height, mobile } = screenshotDevices[device];
    return screenshotSchemes.map(scheme => ({ device, scheme, width, height, mobile }));
  });
}

/** The pixel size a variant's capture must decode to. */
export function masterSize(variant: CaptureVariant): { width: number; height: number } {
  return { width: variant.width * screenshotScale, height: variant.height * screenshotScale };
}

/** The media features a variant emulates: its colour scheme, and reduced motion so nothing is caught mid-animation. */
export function mediaFeatures(scheme: ScreenshotScheme): { name: string; value: string }[] {
  return [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }];
}

/** A variant's master, relative to `src/assets/screenshots/`. */
export function masterPath(slug: string, variant: Pick<CaptureVariant, 'device' | 'scheme'>): string {
  return `${slug}/${variant.device}-${variant.scheme}.webp`;
}

/** Fails unless the capture is exactly twice the viewport; a wrong size is never resized into place. */
export async function checkMasterSize(png: Buffer, variant: CaptureVariant): Promise<void> {
  const { width, height } = await sharp(png).metadata();
  const expected = masterSize(variant);
  if (width !== expected.width || height !== expected.height) {
    throw new Error(`capture is ${width}x${height}, expected ${expected.width}x${expected.height}`);
  }
}

/** True when two images decode to the same RGBA pixels, whatever their encoding. */
export async function identicalPixels(a: Buffer, b: Buffer): Promise<boolean> {
  const decode = (image: Buffer) => sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [left, right] = await Promise.all([decode(a), decode(b)]);
  return left.info.width === right.info.width && left.info.height === right.info.height && left.data.equals(right.data);
}

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
  params?: { type?: string; loaderId?: string; response?: { status: number } };
  result?: {
    data?: string; errorText?: string; loaderId?: string;
    result?: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } };
  };
  error?: { message: string };
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

/** The navigation's own document response, matched by the loader `Page.navigate` returned so an iframe's
 *  document can't stand in for it; the last one wins, so the final status is the one that decides whether
 *  the site loaded. */
export function mainDocumentStatus(responses: readonly { type: string; loaderId: string; status: number }[],
  loaderId: string | undefined): number | undefined {
  return [...responses].reverse().find(response => response.type === 'Document' && response.loaderId === loaderId)?.status;
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
  // Written into the same throwaway profile dir `withBrowser` already removes, so nothing survives the
  // capture. macOS visitors see these system-font stacks in SF Pro and SF Mono; FONTCONFIG_FILE on this
  // one process maps them that way for the capture alone, leaving the desktop's own defaults untouched.
  const fontconfigPath = join(userDataDir, 'fontconfig.xml');
  await writeFile(fontconfigPath, appleFontconfigXml());
  const proc = spawn(chromePath, chromeArgs(userDataDir), {
    stdio: ['ignore', 'ignore', 'pipe'], detached: true, env: { ...process.env, FONTCONFIG_FILE: fontconfigPath },
  });
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

/** URW's P052 is a metric clone of Palatino, built from the same four classic faces. */
const palatinoFaces = [
  { weight: 400, style: 'normal', local: 'P052-Roman' },
  { weight: 700, style: 'normal', local: 'P052-Bold' },
  { weight: 400, style: 'italic', local: 'P052-Italic' },
  { weight: 700, style: 'italic', local: 'P052-BoldItalic' },
] as const;

// Only the two named Palatino families are aliased, never "Iowan Old Style": fontconfig's own Palatino →
// P052 substitution already covers the generic case, and leaving Iowan alone keeps the capture true to
// what a Windows visitor (who falls through to Palatino Linotype, not Iowan) actually sees.
const palatinoFamilies = ['Palatino Linotype', 'Palatino'] as const;

// Chromium on Linux applies fontconfig's Palatino → P052 substitution for the generic "serif" family, but
// not for a page's own named "Palatino Linotype" or "Palatino", so a page's serif stack falls past both
// straight to Chromium's built-in default, a Times-like face unlike what any real visitor sees. Aliasing
// the named families to the local P052 faces makes Chromium pick the same clone fontconfig already
// resolves for "serif".
export function palatinoAliasCss(): string {
  return palatinoFamilies.flatMap(family => palatinoFaces.map(face =>
    `@font-face { font-family: "${family}"; src: local("${face.local}"); font-weight: ${face.weight}; font-style: ${face.style}; }`,
  )).join('\n');
}

const palatinoAliasScript = `(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(palatinoAliasCss())};
  document.head.append(style);
  return true;
})()`;

/** True only when `fc-match` resolves its probe to `family` itself, not a fallback; a pure check on the
 *  match output, so it's testable without fontconfig installed. */
export function familyAvailable(fcMatchOutput: string, family: string): boolean {
  return fcMatchOutput.trim() === family;
}

/** True only when `fc-match` resolves `P052-Roman` to the `P052` family itself, not a fallback; a pure
 *  check on the match output, so it's testable without fontconfig installed. */
export function p052Available(fcMatchOutput: string): boolean {
  return familyAvailable(fcMatchOutput, 'P052');
}

/** Fails fast, before any browser is launched, when the URW P052 clone isn't installed: without it this
 *  script would silently capture Chromium's own fallback serif instead of the Palatino look every real
 *  visitor gets. */
export async function checkPalatinoFontInstalled(): Promise<void> {
  const message = 'P052 (the URW Palatino clone) is not available to fontconfig. '
    + 'Install the URW base-35 fonts, e.g. gsfonts / fonts-urw-base35.';
  const stdout = await promisify(execFile)('fc-match', ['-f', '%{family}', 'P052-Roman'])
    .then(result => result.stdout, () => { throw new Error(message); });
  if (!p052Available(stdout)) throw new Error(message);
}

/** The system-font stacks these Work sites use render in SF Pro and SF Mono for a macOS visitor. The
 *  static SF Pro Text faces stand in for SF Pro: Chromium on Linux picks the variable font's Expanded
 *  instances for in-between weights and ignores its weight axis otherwise, and it can't switch to the
 *  Display cut at large sizes as macOS does, so headings set a little looser than on a Mac. */
const appleFontFamilies = ['SF Pro Text', 'SF Mono'] as const;

/** Fails fast, before any browser is launched, when SF Pro Text or SF Mono isn't installed: without
 *  them the capture would fall back to the desktop's own default (Adwaita Sans) instead of what a macOS
 *  visitor actually sees for a `system-ui`/`ui-monospace` stack. */
export async function checkAppleFontsInstalled(): Promise<void> {
  for (const family of appleFontFamilies) {
    const message = `${family} is not available to fontconfig. Download it from `
      + `https://developer.apple.com/fonts/ and install it under ~/.local/share/fonts/.`;
    const stdout = await promisify(execFile)('fc-match', ['-f', '%{family}', family])
      .then(result => result.stdout, () => { throw new Error(message); });
    if (!familyAvailable(stdout, family)) throw new Error(message);
  }
}

// Scoped to the capture browser alone, via FONTCONFIG_FILE on its own process, so the desktop's own
// fontconfig defaults (and every other application's) stay untouched. `system-ui` is matched first and
// strongly, ahead of the include, because that is the first family every stack here lists; plain
// "sans-serif" is left to Chromium's own default (Adwaita Sans) since no stack names it first.
export function appleFontconfigXml(): string {
  return `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <match target="pattern">
    <test name="family"><string>system-ui</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>SF Pro Text</string></edit>
  </match>
  <alias binding="strong"><family>sans-serif</family><prefer><family>SF Pro Text</family></prefer></alias>
  <alias binding="strong"><family>monospace</family><prefer><family>SF Mono</family></prefer></alias>
</fontconfig>
`;
}

// Resolves once the web fonts are ready and every image that can appear on the first screen has loaded
// and decoded, or reports what is still pending after `ms`. Lazy images outside the viewport are left
// out: they are not in the capture, and the browser may never load them.
const settleScript = (ms: number) => `(async () => {
  const inView = img => { const r = img.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  const wanted = () => [...document.images].filter(img => img.loading !== 'lazy' || inView(img));
  const loaded = img => img.complete ? Promise.resolve() : new Promise(resolve => {
    img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true });
  });
  const ready = Promise.all([document.fonts.ready, ...wanted().map(loaded)])
    .then(() => Promise.all(wanted().map(img => img.decode().catch(() => {}))))
    .then(() => 'ready');
  const outcome = await Promise.race([ready, new Promise(resolve => setTimeout(resolve, ${ms}, 'timeout'))]);
  return { outcome, fonts: document.fonts.status, pending: wanted().filter(img => !img.complete).length };
})()`;

// Hides the text caret, then finishes every finite animation and cancels the infinite ones (`finish()`
// throws for those). The style goes in first so a transition it might start is finished with the rest.
const stillScript = `(() => {
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { caret-color: transparent !important; }';
  document.head.append(style);
  for (const animation of document.getAnimations()) {
    try { animation.finish(); } catch { animation.cancel(); }
  }
  return true;
})()`;

// Two animation frames: the first runs after the style and animation changes above, the second after
// that frame has been painted, so the capture shows the settled page without a guessed fixed delay.
const paintedScript = 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))';

async function evaluate(ws: WebSocket, pending: Map<number, (message: CdpMessage) => void>, counter: { next: number },
  expression: string, timeoutMs: number): Promise<unknown> {
  const reply = await send(ws, pending, counter, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
  const exception = reply.result?.exceptionDetails;
  if (reply.error || exception) {
    throw new Error(`page script failed: ${reply.error?.message ?? exception?.exception?.description ?? exception?.text}`);
  }
  return reply.result?.result?.value;
}

/** Captures one variant in its own tab. The tab opens on about:blank and every emulation is set before
 *  `Page.navigate`, so the site's first paint already uses the variant's viewport, scale and colour scheme. */
export async function captureVariant(endpoint: string, url: string, variant: CaptureVariant): Promise<Buffer> {
  const response = await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`could not open a tab: HTTP ${response.status}`);
  const target = await response.json() as { id: string; webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map<number, (message: CdpMessage) => void>();
  const counter = { next: 1 };
  let events: string[] = [];
  const responses: { type: string; loaderId: string; status: number }[] = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data as string) as CdpMessage;
    if (message.id !== undefined && pending.has(message.id)) { pending.get(message.id)!(message); pending.delete(message.id); }
    else if (message.method === 'Network.responseReceived' && message.params?.response) {
      responses.push({ type: message.params.type ?? '', loaderId: message.params.loaderId ?? '', status: message.params.response.status });
    } else if (message.method) events.push(message.method);
  });
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('DevTools socket error')));
    }), 10_000, 'timed out opening the DevTools socket');
    await send(ws, pending, counter, 'Network.enable');
    await send(ws, pending, counter, 'Page.enable');
    await send(ws, pending, counter, 'Page.bringToFront');
    await send(ws, pending, counter, 'Emulation.setDeviceMetricsOverride', {
      width: variant.width, height: variant.height, deviceScaleFactor: screenshotScale, mobile: variant.mobile,
    });
    await send(ws, pending, counter, 'Emulation.setTouchEmulationEnabled', { enabled: variant.mobile, maxTouchPoints: variant.mobile ? 5 : 1 });
    await send(ws, pending, counter, 'Emulation.setEmulatedMedia', { features: mediaFeatures(variant.scheme) });
    await send(ws, pending, counter, 'Emulation.setScrollbarsHidden', { hidden: true });
    events = [];
    const navigation = await send(ws, pending, counter, 'Page.navigate', { url }, 20_000);
    if (navigation.error || navigation.result?.errorText) {
      throw new Error(`could not load ${url}: ${navigation.error?.message ?? navigation.result?.errorText}`);
    }
    // Page events are enabled before navigating, so the load event cannot be missed; the bounded wait
    // still keeps a page that never fires it from hanging the capture. Both timers are cleared on
    // whichever path wins, so a fast load doesn't leave the 15s fallback running behind it.
    await new Promise<void>(resolve => {
      const timer = setInterval(() => { if (events.includes('Page.loadEventFired')) { clearInterval(timer); clearTimeout(fallback); resolve(); } }, 100);
      const fallback = setTimeout(() => { clearInterval(timer); resolve(); }, 15_000);
    });
    const status = mainDocumentStatus(responses, navigation.result?.loaderId);
    if (status !== undefined && status >= 400) throw new Error(`main document returned HTTP ${status} for ${url}`);
    // Injected after load but before the settle step below, so the font swap it causes is one of the
    // things `document.fonts.ready` in `settleScript` waits on, not something applied after the capture
    // already considered itself settled.
    await evaluate(ws, pending, counter, palatinoAliasScript, 5_000);
    const settled = await evaluate(ws, pending, counter, settleScript(10_000), 15_000) as { outcome: string; fonts: string; pending: number };
    if (settled.outcome !== 'ready') {
      throw new Error(`page did not settle within 10s (fonts ${settled.fonts}, ${settled.pending} image(s) still loading)`);
    }
    await evaluate(ws, pending, counter, stillScript, 5_000);
    await evaluate(ws, pending, counter, paintedScript, 5_000);
    const shot = await send(ws, pending, counter, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, 20_000);
    if (!shot.result?.data) throw new Error(`no screenshot data: ${shot.error?.message ?? 'unknown error'}`);
    const png = Buffer.from(shot.result.data, 'base64');
    await checkMasterSize(png, variant);
    return png;
  } finally {
    ws.close();
    await fetch(`${endpoint}/json/close/${target.id}`).catch(() => {});
  }
}

/** Runs `use` against a freshly launched browser with a throwaway profile, then removes both. */
export async function withBrowser<T>(chromePath: string, use: (endpoint: string) => Promise<T>): Promise<T> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'capture-screenshots-'));
  // One outer cleanup covers every way the steps below can fail: a `launchBrowser` timeout or exit kills
  // its own child before rejecting (see above), so `proc` here stays undefined and only the profile
  // directory needs removing; once launched, both the process and the directory need to go.
  let proc: ReturnType<typeof spawn> | undefined;
  try {
    const launched = await launchBrowser(chromePath, userDataDir);
    proc = launched.proc;
    return await use(launched.browserWsUrl.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*/, ''));
  } finally {
    if (proc) killBrowser(proc);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

/** Lossless, so every size the build derives from a master is pixel-exact; sharp writes no metadata. */
async function writeMaster(dir: URL, slug: string, variant: CaptureVariant, png: Buffer): Promise<void> {
  const webp = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer();
  const file = new URL(masterPath(slug, variant), dir);
  await mkdir(new URL('./', file), { recursive: true });
  await writeFile(file, webp);
  console.log(`${slug}: wrote ${masterPath(slug, variant)} (${webp.byteLength} bytes)`);
}

/** Captures one site's four variants in one browser. A device's dark capture that matches its light one
 *  pixel for pixel means the site has no dark theme: no dark master is written, and a stale one is removed.
 *  Returns one message per failed variant; a failed light capture skips that device's dark one. */
async function captureSite(chromePath: string, dir: URL, slug: string, url: string): Promise<string[]> {
  const failures: string[] = [];
  const fail = (variant: CaptureVariant, error: unknown) =>
    failures.push(`${variant.device}-${variant.scheme}: ${error instanceof Error ? error.message : error}`);
  await withBrowser(chromePath, async endpoint => {
    const variants = captureVariants();
    for (const light of variants.filter(variant => variant.scheme === 'light')) {
      const dark = variants.find(variant => variant.device === light.device && variant.scheme === 'dark')!;
      let lightPng: Buffer;
      try {
        lightPng = await captureVariant(endpoint, url, light);
        await writeMaster(dir, slug, light, lightPng);
      } catch (error) {
        fail(light, error);
        continue;
      }
      try {
        const darkPng = await captureVariant(endpoint, url, dark);
        if (await identicalPixels(lightPng, darkPng)) {
          await rm(new URL(masterPath(slug, dark), dir), { force: true });
          console.log(`${slug}: ${light.device} has no dark theme (dark capture matches light), so no ${masterPath(slug, dark)}`);
        } else {
          await writeMaster(dir, slug, dark, darkPng);
        }
      } catch (error) {
        fail(dark, error);
      }
    }
  });
  return failures;
}

if (import.meta.main) {
  await checkPalatinoFontInstalled();
  await checkAppleFontsInstalled();
  const chromePath = process.env['CHROME_PATH'] ?? 'google-chrome';
  const sources = await readWorkSources(new URL('src/content/work/', root));
  const targets = sources.filter((source): source is typeof source & { site: string } => source.site !== undefined);
  const dir = new URL('src/assets/screenshots/', root);
  let failures = 0;
  // One browser per site: a crash or hang on one site cannot spoil the next, and each site starts from an
  // empty profile, with no cache or storage left by another.
  for (const target of targets) {
    try {
      const failed = await captureSite(chromePath, dir, target.id, target.site);
      failures += failed.length;
      for (const message of failed) console.error(`${target.id}: ${message}`);
    } catch (error) {
      failures += 1;
      console.error(`${target.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (failures) process.exitCode = 1;
  else console.log(`Captured ${targets.length} site${targets.length === 1 ? '' : 's'}.`);
}
