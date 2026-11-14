import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  appleFontconfigXml, captureVariants, checkAppleFontsInstalled, checkMasterSize, checkPalatinoFontInstalled, chromeArgs,
  devtoolsUrl, familyAvailable, identicalPixels, launchBrowser, mainDocumentStatus, masterPath, masterSize, mediaFeatures,
  p052Available, palatinoAliasCss, send, withTimeout,
} from '../../scripts/capture-screenshots.ts';

const solid = (width: number, height: number, r: number) =>
  sharp({ create: { width, height, channels: 4, background: { r, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();

test('chromeArgs launches headless at a fixed size with a throwaway profile and no persisted state', () => {
  const args = chromeArgs('/tmp/capture-screenshots-abc123');
  assert.ok(args.includes('--headless=new'));
  assert.ok(args.includes('--hide-scrollbars'));
  assert.ok(args.includes('--window-size=1280,800'));
  assert.ok(args.includes('--user-data-dir=/tmp/capture-screenshots-abc123'));
  assert.ok(args.includes('--remote-debugging-port=0'));
  assert.equal(args.at(-1), 'about:blank');
});

test('devtoolsUrl reads the websocket URL Chrome/Brave print on startup', () => {
  const stderr = '[1:1:x] some log line\nDevTools listening on ws://127.0.0.1:34567/devtools/browser/abc-123\n';
  assert.equal(devtoolsUrl(stderr), 'ws://127.0.0.1:34567/devtools/browser/abc-123');
});

test('devtoolsUrl returns undefined before the listener line has printed', () => {
  assert.equal(devtoolsUrl('[1:1:x] starting up\n'), undefined);
});

test('withTimeout clears its own timer once the promise settles, win or lose', async () => {
  const originalClear = global.clearTimeout;
  let cleared = 0;
  global.clearTimeout = ((handle: NodeJS.Timeout) => { cleared += 1; return originalClear(handle); }) as typeof clearTimeout;
  try {
    await withTimeout(Promise.resolve('ok'), 50, 'nope');
    assert.equal(cleared, 1);
    await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 50, 'nope'), /boom/);
    assert.equal(cleared, 2);
  } finally {
    global.clearTimeout = originalClear;
  }
});

test('withTimeout rejects with its own message once the timeout elapses first', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5, 'timed out waiting'), /timed out waiting/);
});

test('send rejects on its own per-request timeout, and cleans up the pending map', async () => {
  class FakeSocket extends EventTarget { send() {} }
  const ws = new FakeSocket() as unknown as WebSocket;
  const pending = new Map<number, (message: { id?: number }) => void>();
  await assert.rejects(send(ws, pending, { next: 1 }, 'Foo.bar', {}, 10), /timed out/);
  assert.equal(pending.size, 0);
});

test('send rejects every pending request once the socket closes', async () => {
  class FakeSocket extends EventTarget { send() {} }
  const ws = new FakeSocket() as unknown as WebSocket;
  const pending = new Map<number, (message: { id?: number }) => void>();
  const first = send(ws, pending, { next: 1 }, 'Foo.bar', {}, 5_000);
  const second = send(ws, pending, { next: 1 }, 'Baz.qux', {}, 5_000);
  (ws as unknown as EventTarget).dispatchEvent(new Event('close'));
  await assert.rejects(first, /socket closed/);
  await assert.rejects(second, /socket closed/);
  assert.equal(pending.size, 0);
});

test('mainDocumentStatus reads the navigation\'s last document response, so the final status decides', () => {
  assert.equal(mainDocumentStatus([
    { type: 'Document', loaderId: 'L1', status: 302 }, { type: 'Stylesheet', loaderId: 'L1', status: 200 },
    { type: 'Document', loaderId: 'L1', status: 404 },
  ], 'L1'), 404);
  assert.equal(mainDocumentStatus([{ type: 'Stylesheet', loaderId: 'L1', status: 200 }], 'L1'), undefined);
  assert.equal(mainDocumentStatus([], 'L1'), undefined);
});

test('mainDocumentStatus ignores an iframe\'s document, so a 404 page with a 200 iframe still fails', () => {
  assert.equal(mainDocumentStatus([
    { type: 'Document', loaderId: 'L1', status: 404 }, { type: 'Document', loaderId: 'L2', status: 200 },
  ], 'L1'), 404);
});

test('launchBrowser rejects promptly when the given binary is not a browser, with nothing left running', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'capture-screenshots-test-'));
  try {
    // /bin/false exits immediately, taking the same "browser exited before it was ready" rejection path
    // launchBrowser also takes on a timeout; here it proves that path leaves no child process behind,
    // without waiting out a real 15s timeout.
    await assert.rejects(launchBrowser('/bin/false', userDataDir), /exited before it was ready/);
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('launchBrowser writes the apple fontconfig file into the throwaway profile dir before spawning', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'capture-screenshots-test-'));
  try {
    await assert.rejects(launchBrowser('/bin/false', userDataDir));
    const written = await readFile(join(userDataDir, 'fontconfig.xml'), 'utf8');
    assert.equal(written, appleFontconfigXml());
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('captureVariants covers desktop and phone, each light then dark, with their viewports and mobile flags', () => {
  assert.deepEqual(captureVariants(), [
    { device: 'desktop', scheme: 'light', width: 1280, height: 800, mobile: false },
    { device: 'desktop', scheme: 'dark', width: 1280, height: 800, mobile: false },
    { device: 'phone', scheme: 'light', width: 390, height: 844, mobile: true },
    { device: 'phone', scheme: 'dark', width: 390, height: 844, mobile: true },
  ]);
});

test('masterSize doubles the CSS viewport, since captures run at device pixel ratio 2', () => {
  const [desktop, , phone] = captureVariants();
  assert.deepEqual(masterSize(desktop!), { width: 2560, height: 1600 });
  assert.deepEqual(masterSize(phone!), { width: 780, height: 1688 });
});

test('mediaFeatures emulates the colour scheme and always asks for reduced motion', () => {
  assert.deepEqual(mediaFeatures('dark'), [
    { name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  assert.deepEqual(mediaFeatures('light'), [
    { name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
});

test('masterPath nests each variant under its Work slug', () => {
  const [, desktopDark, phoneLight] = captureVariants();
  assert.equal(masterPath('deadhead', desktopDark!), 'deadhead/desktop-dark.webp');
  assert.equal(masterPath('one', phoneLight!), 'one/phone-light.webp');
});

test('checkMasterSize accepts a capture at exactly twice the viewport and rejects anything else', async () => {
  const [, , phone] = captureVariants();
  await checkMasterSize(await solid(780, 1688, 10), phone!);
  await assert.rejects(checkMasterSize(await solid(390, 844, 10), phone!), /390x844.*expected 780x1688/);
});

test('palatinoAliasCss aliases both named Palatino families to the four P052 faces, never Iowan Old Style', () => {
  const css = palatinoAliasCss();
  assert.ok(css.includes('font-family: "Palatino Linotype"'));
  assert.ok(css.includes('font-family: "Palatino"'));
  assert.ok(!css.includes('Iowan'));
  for (const local of ['P052-Roman', 'P052-Bold', 'P052-Italic', 'P052-BoldItalic']) {
    assert.ok(css.includes(`local("${local}")`), `missing ${local}`);
  }
  assert.ok(/font-family: "Palatino Linotype";\s*src: local\("P052-Bold"\);\s*font-weight: 700;\s*font-style: normal;/.test(css));
  assert.ok(/font-family: "Palatino";\s*src: local\("P052-Italic"\);\s*font-weight: 400;\s*font-style: italic;/.test(css));
  // One @font-face per family per face: two families times four faces.
  assert.equal(css.match(/@font-face/g)?.length, 8);
});

test('p052Available is true only when fc-match resolves P052-Roman to the P052 family itself', () => {
  assert.equal(p052Available('P052\n'), true);
  assert.equal(p052Available('P052'), true);
  assert.equal(p052Available('Times New Roman\n'), false);
  assert.equal(p052Available(''), false);
});

test('checkPalatinoFontInstalled resolves when fc-match resolves P052-Roman to P052 on this machine', async () => {
  await assert.doesNotReject(checkPalatinoFontInstalled());
});

test('familyAvailable is true only when fc-match resolves the probe to that family itself', () => {
  assert.equal(familyAvailable('SF Pro\n', 'SF Pro'), true);
  assert.equal(familyAvailable('SF Pro', 'SF Pro'), true);
  assert.equal(familyAvailable('Adwaita Sans\n', 'SF Pro'), false);
  assert.equal(familyAvailable('', 'SF Pro'), false);
});

test('appleFontconfigXml prepends SF Pro Text onto system-ui and aliases the sans-serif/monospace generics to SF Pro Text/SF Mono', () => {
  const xml = appleFontconfigXml();
  assert.ok(xml.includes('<include ignore_missing="yes">/etc/fonts/fonts.conf</include>'));
  assert.ok(/<test name="family"><string>system-ui<\/string><\/test>/.test(xml));
  assert.ok(/<edit name="family" mode="prepend" binding="strong"><string>SF Pro Text<\/string><\/edit>/.test(xml));
  assert.ok(/<family>sans-serif<\/family><prefer><family>SF Pro Text<\/family><\/prefer>/.test(xml));
  assert.ok(/<family>monospace<\/family><prefer><family>SF Mono<\/family><\/prefer>/.test(xml));
  assert.ok(!xml.includes('Adwaita'));
});

test('checkAppleFontsInstalled resolves when fc-match resolves both SF Pro Text and SF Mono on this machine', async () => {
  await assert.doesNotReject(checkAppleFontsInstalled());
});

test('identicalPixels compares decoded pixels, not encoded bytes', async () => {
  const red = await solid(4, 3, 200);
  const sameRedOtherEncoding = await sharp(red).png({ compressionLevel: 0 }).toBuffer();
  assert.notDeepEqual(red, sameRedOtherEncoding);
  assert.equal(await identicalPixels(red, sameRedOtherEncoding), true);
  assert.equal(await identicalPixels(red, await solid(4, 3, 201)), false);
  assert.equal(await identicalPixels(red, await solid(3, 4, 200)), false);
});
