import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findScreenshot, screenshotAlt } from '../../src/data/screenshots.ts';

test('findScreenshot looks a slug up by the path import.meta.glob would use', () => {
  const modules = {
    '/src/assets/screenshots/deadhead.webp': { default: { src: '/deadhead.abc123.webp', width: 1280, height: 800 } },
  };
  assert.deepEqual(findScreenshot(modules, 'deadhead'), { src: '/deadhead.abc123.webp', width: 1280, height: 800 });
});

test('findScreenshot returns undefined for a Work with no captured screenshot', () => {
  assert.equal(findScreenshot({}, 'homelab'), undefined);
});

test('screenshotAlt describes a Work\'s home page by title', () => {
  assert.equal(screenshotAlt('deadhead'), 'Home page of deadhead');
  assert.equal(screenshotAlt('Astro Minimal Template'), 'Home page of Astro Minimal Template');
});
