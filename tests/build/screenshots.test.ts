import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import sharp from 'sharp';
import { createBuildFixture } from '../helpers/build-fixture.ts';

const component = new URL('../../src/components/Preview.astro', import.meta.url).href;
const master = (width: number, height: number, r: number) =>
  sharp({ create: { width, height, channels: 3, background: { r, g: 40, b: 40 } } }).webp({ lossless: true }).toBuffer();
const page = (props: string) => `---
import Preview from ${JSON.stringify(component)};
import desktopLight from '../assets/desktop-light.webp';
import desktopDark from '../assets/desktop-dark.webp';
import phoneLight from '../assets/phone-light.webp';
import phoneDark from '../assets/phone-dark.webp';
---
<main><Preview title="Fixture" site="https://fixture.example/" screenshots={${props}} /></main>`;

/** Each <picture>: its class, then its children as the tag plus the attributes that pick and load a source. */
function pictures(html: string): string[][] {
  return [...html.matchAll(/<picture class="([^"]*)">(.*?)<\/picture>/gs)].map(([, className, inner]) => [className!,
    ...[...inner!.matchAll(/<(source|img)\b([^>]*)>/g)].map(([, tag, attributes]) => {
      const attribute = (name: string) => attributes!.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
      return [tag, attribute('type') && `type=${attribute('type')}`, tag === 'img' && `${attribute('width')}x${attribute('height')}`,
        attribute('loading'), attribute('fetchpriority')].filter(Boolean).join(' ');
    })]);
}

test('the preview compares both schemes per device, and shows a site without a dark theme as its one capture', async t => {
  const fixture = await createBuildFixture({
    configSource: "export default { site: 'https://example.test' };",
    pages: {
      'both.astro': page('{ desktop: { light: desktopLight, dark: desktopDark }, phone: { light: phoneLight, dark: phoneDark } }'),
      'light.astro': page('{ desktop: { light: desktopLight } }'),
    },
  });
  t.after(() => fixture.cleanup());
  await mkdir(new URL('src/assets/', fixture.root), { recursive: true });
  await writeFile(new URL('src/assets/desktop-light.webp', fixture.root), await master(2560, 1600, 240));
  await writeFile(new URL('src/assets/desktop-dark.webp', fixture.root), await master(2560, 1600, 20));
  await writeFile(new URL('src/assets/phone-light.webp', fixture.root), await master(780, 1688, 240));
  await writeFile(new URL('src/assets/phone-dark.webp', fixture.root), await master(780, 1688, 20));
  const result = await fixture.build();
  assert.equal(result.code, 0, result.log);

  const both = await readFile(new URL('both/index.html', result.outDir), 'utf8');
  // The desktop pair is the largest paint in either scheme, so both copies load first at high priority; the phone
  // pair waits until shown.
  assert.deepEqual(pictures(both), [
    ['shot shot-light', 'source type=image/webp', 'img 1280x800 eager high'],
    ['shot shot-dark', 'source type=image/webp', 'img 1280x800 eager high'],
    ['shot shot-light', 'source type=image/webp', 'img 390x844 lazy'],
    ['shot shot-dark', 'source type=image/webp', 'img 390x844 lazy'],
  ]);
  assert.match(both, /alt="Home page of Fixture on a desktop, dark scheme"/);
  assert.equal(both.match(/<input type="radio" name="device"/g)?.length, 2);
  assert.equal(both.match(/class="compare-track" tabindex="0" role="scrollbar"/g)?.length, 2);
  assert.match(both, /<img src="[^"]+\.png" srcset="[^"]+ 640w, [^"]+ 1280w, [^"]+ 1920w, [^"]+ 2560w"/);

  const light = await readFile(new URL('light/index.html', result.outDir), 'utf8');
  assert.deepEqual(pictures(light), [['shot shot-light', 'source type=image/webp', 'img 1280x800 eager high']]);
  assert.match(light, /alt="Home page of Fixture on a desktop"/);
  // Nothing to compare, so no switch, no track and no drag script.
  assert.doesNotMatch(light, /compare-track|type="radio"|<script/);
});
