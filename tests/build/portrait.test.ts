import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import sharp from 'sharp';
import { portraitFile } from '../../src/data/portrait.ts';
import { createBuildFixture } from '../helpers/build-fixture.ts';

const component = new URL('../../src/components/Portrait.astro', import.meta.url).href;

/** Each <img> tag in the page, as its raw attribute string. */
const images = (html: string) => [...html.matchAll(/<img\b([^>]*)>/g)].map(([, attributes]) => attributes!);

test('the portrait offers 1x, 1.5x and 2x of 240 CSS px, and only the prioritised copy asks for high fetch priority', async t => {
  const fixture = await createBuildFixture({
    configSource: "export default { site: 'https://example.test' };",
    pages: {
      'index.astro': `---
import Portrait from ${JSON.stringify(component)};
---
<main><Portrait alt="Prioritised" priority /><Portrait alt="Plain" /></main>`,
    },
  });
  t.after(() => fixture.cleanup());
  await mkdir(new URL('src/assets/portrait/', fixture.root), { recursive: true });
  await writeFile(new URL(`src/assets/portrait/${portraitFile}`, fixture.root),
    await sharp({ create: { width: 1200, height: 1200, channels: 3, background: { r: 90, g: 90, b: 90 } } }).jpeg().toBuffer());
  const result = await fixture.build();
  assert.equal(result.code, 0, result.log);
  const html = await readFile(new URL('index.html', result.outDir), 'utf8');
  for (const source of html.match(/<source\b[^>]*>/g) ?? []) {
    assert.match(source, /srcset="[^"]+ 240w, [^"]+ 360w, [^"]+ 480w"/);
    assert.match(source, /sizes="240px"/);
  }
  const [prioritised, plain] = images(html);
  assert.match(prioritised!, /alt="Prioritised"/);
  assert.match(prioritised!, /fetchpriority="high"/);
  assert.match(prioritised!, /loading="eager"/);
  assert.match(prioritised!, /srcset="[^"]+ 240w, [^"]+ 360w, [^"]+ 480w"/);
  assert.match(plain!, /alt="Plain"/);
  assert.doesNotMatch(plain!, /fetchpriority/);
  assert.match(plain!, /loading="eager"/);
});
