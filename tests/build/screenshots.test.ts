import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import sharp from 'sharp';
import { createBuildFixture } from '../helpers/build-fixture.ts';

const component = new URL('../../src/components/Screenshot.astro', import.meta.url).href;
const master = (r: number) =>
  sharp({ create: { width: 80, height: 50, channels: 3, background: { r, g: 40, b: 40 } } }).webp({ lossless: true }).toBuffer();

/** Each <picture>'s children, in order, as their tag name plus the attributes that pick a source. */
function pictures(html: string): string[][] {
  return [...html.matchAll(/<picture>(.*?)<\/picture>/gs)].map(([, inner]) =>
    [...inner!.matchAll(/<(source|img)\b([^>]*)>/g)].map(([, tag, attributes]) => {
      const attribute = (name: string) => attributes!.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
      const media = attribute('media');
      return [tag, media && `media=${media}`, attribute('type') && `type=${attribute('type')}`,
        tag === 'img' && `${attribute('width')}x${attribute('height')}`].filter(Boolean).join(' ');
    }));
}

test('a screenshot with a dark master serves dark then light WebP, then dark PNG, then the light PNG <img>', async t => {
  const fixture = await createBuildFixture({
    configSource: "export default { site: 'https://example.test' };",
    pages: {
      'index.astro': `---
import Screenshot from ${JSON.stringify(component)};
import light from '../assets/light.webp';
import dark from '../assets/dark.webp';
---
<main>
<Screenshot images={{ light, dark }} width={40} height={25} widths={[20, 40, 80]} alt="Both schemes" />
<Screenshot images={{ light }} width={40} height={25} widths={[20, 40, 80]} alt="Light only" />
</main>`,
    },
  });
  t.after(() => fixture.cleanup());
  await mkdir(new URL('src/assets/', fixture.root), { recursive: true });
  await writeFile(new URL('src/assets/light.webp', fixture.root), await master(240));
  await writeFile(new URL('src/assets/dark.webp', fixture.root), await master(20));
  const result = await fixture.build();
  assert.equal(result.code, 0, result.log);
  const html = await readFile(new URL('index.html', result.outDir), 'utf8');
  assert.deepEqual(pictures(html), [
    [
      'source media=(prefers-color-scheme: dark) type=image/webp',
      'source type=image/webp',
      'source media=(prefers-color-scheme: dark) type=image/png',
      'img 40x25',
    ],
    ['source type=image/webp', 'img 40x25'],
  ]);
  assert.match(html, /<img src="[^"]+\.png" srcset="[^"]+ 20w, [^"]+ 40w, [^"]+ 80w" sizes="\(min-width: 40px\) 40px, 100vw"/);
});
