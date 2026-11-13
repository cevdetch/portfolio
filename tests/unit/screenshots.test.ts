import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findScreenshots, screenshotAlt, screenshotSizes } from '../../src/data/screenshots.ts';

const image = (name: string) => ({ default: { src: `/${name}.abc123.webp`, width: 2560, height: 1600 } });

test('findScreenshots groups a Work\'s masters by device and scheme, keyed the way import.meta.glob names them', () => {
  const modules = {
    '/src/assets/screenshots/deadhead/desktop-light.webp': image('desktop-light'),
    '/src/assets/screenshots/deadhead/desktop-dark.webp': image('desktop-dark'),
    '/src/assets/screenshots/deadhead/phone-light.webp': image('phone-light'),
    '/src/assets/screenshots/one/phone-dark.webp': image('other-work'),
  };
  assert.deepEqual(findScreenshots(modules, 'deadhead'), {
    desktop: { light: image('desktop-light').default, dark: image('desktop-dark').default },
    phone: { light: image('phone-light').default },
  });
});

test('findScreenshots ignores a device with only a dark master, since light is the base every page needs', () => {
  const modules = {
    '/src/assets/screenshots/deadhead/desktop-light.webp': image('desktop-light'),
    '/src/assets/screenshots/deadhead/phone-dark.webp': image('phone-dark'),
  };
  assert.deepEqual(findScreenshots(modules, 'deadhead'), { desktop: { light: image('desktop-light').default } });
});

test('findScreenshots ignores files outside the device-scheme naming and other slugs that share a prefix', () => {
  const modules = {
    '/src/assets/screenshots/deadhead.webp': image('flat'),
    '/src/assets/screenshots/deadhead/tablet-light.webp': image('tablet'),
    '/src/assets/screenshots/deadhead-two/desktop-light.webp': image('prefix'),
  };
  assert.deepEqual(findScreenshots(modules, 'deadhead'), {});
});

test('findScreenshots returns no devices for a Work with no captures', () => {
  assert.deepEqual(findScreenshots({}, 'homelab'), {});
});

test('screenshotAlt describes a Work\'s home page by title and device', () => {
  assert.equal(screenshotAlt('deadhead', 'desktop'), 'Home page of deadhead on a desktop');
  assert.equal(screenshotAlt('Astro Minimal Template', 'phone'), 'Home page of Astro Minimal Template on a phone');
});

test('screenshotSizes caps the image at its CSS width and fills narrower viewports', () => {
  assert.equal(screenshotSizes(1280), '(min-width: 1280px) 1280px, 100vw');
  assert.equal(screenshotSizes(390), '(min-width: 390px) 390px, 100vw');
});
