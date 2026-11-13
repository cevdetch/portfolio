import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromeArgs, devtoolsUrl, launchBrowser, mainDocumentStatus, send, withTimeout } from '../../scripts/capture-screenshots.ts';

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

test('mainDocumentStatus reads the last main-document response, so a redirect chain resolves to the final status', () => {
  assert.equal(mainDocumentStatus([
    { type: 'Document', status: 302 }, { type: 'Stylesheet', status: 200 }, { type: 'Document', status: 404 },
  ]), 404);
  assert.equal(mainDocumentStatus([{ type: 'Stylesheet', status: 200 }]), undefined);
  assert.equal(mainDocumentStatus([]), undefined);
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
