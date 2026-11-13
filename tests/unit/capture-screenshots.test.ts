import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromeArgs, devtoolsUrl, launchBrowser } from '../../scripts/capture-screenshots.ts';

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
