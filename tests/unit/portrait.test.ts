import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { checkPortrait } from '../../src/gates/portrait.ts';
import { portraitOutputs, portraitUrl, readPortraitSize } from '../../src/data/portrait.ts';
import { preparePortrait } from '../../scripts/prepare-portrait.ts';

// A noisy image, so the encoder has something to compress and sizes behave like a photo's.
const photo = (width: number, height: number) => sharp(Buffer.from(Array.from({ length: width * height * 3 }, (_, i) => (i * 7919) % 251)),
  { raw: { width, height, channels: 3 } });
const jpeg = (width: number, height = width) => photo(width, height).jpeg({ quality: 50 }).toBuffer();

test('a square sRGB JPEG with no metadata passes', async () => {
  assert.deepEqual(await checkPortrait(await jpeg(400)), []);
});

test('a JPEG carrying EXIF fails, GPS or not', async () => {
  const withExif = await photo(400, 400).withExif({ IFD0: { Copyright: 'someone' }, IFD3: { GPSLatitudeRef: 'N' } }).jpeg().toBuffer();
  assert.deepEqual(await checkPortrait(withExif), ['carries EXIF metadata']);
});

test('a JPEG carrying XMP fails', async () => {
  const withXmp = await photo(400, 400).withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>').jpeg().toBuffer();
  assert.deepEqual(await checkPortrait(withXmp), ['carries XMP metadata']);
});

test('a portrait that is not square, or smaller than 400 px, fails', async () => {
  assert.deepEqual(await checkPortrait(await jpeg(500, 400)), ['is 500x400; a portrait must be square']);
  assert.deepEqual(await checkPortrait(await jpeg(300)), ['is 300x300; a portrait must be at least 400 px']);
});

test('a portrait of 200 KB or more fails', async () => {
  const heavy = await photo(1200, 1200).jpeg({ quality: 100 }).toBuffer();
  assert.ok(heavy.length >= 200_000);
  assert.deepEqual(await checkPortrait(heavy), [`weighs ${heavy.length} bytes; a portrait must stay under 200000`]);
});

test('a portrait that is not a JPEG fails', async () => {
  assert.deepEqual(await checkPortrait(await photo(400, 400).png().toBuffer()), ['is png; a portrait must be a JPEG']);
});

test('preparePortrait squares, resizes and strips every piece of metadata, so the result passes the gate', async () => {
  const source = await photo(900, 700).withExif({ IFD0: { Copyright: 'someone' } }).withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"/>')
    .withIccProfile('p3').jpeg().toBuffer();
  const prepared = await preparePortrait(source, 600);
  const meta = await sharp(prepared).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 600);
  assert.equal(meta.height, 600);
  assert.equal(meta.space, 'srgb');
  assert.equal(meta.isProgressive, true);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.iptc, undefined);
  assert.equal(meta.icc, undefined);
  assert.deepEqual(await checkPortrait(prepared), []);
});

test('the web, page and CV copies share one file name, and the CV copy is sized for print', () => {
  assert.deepEqual(portraitOutputs.map(output => [output.path, output.size]), [
    ['public/cevdet-haran.jpg', 1200], ['src/assets/portrait/cevdet-haran.jpg', 1200], ['cv/cevdet-haran.jpg', 600],
  ]);
  assert.equal(portraitUrl('https://cevdet.ch/'), 'https://cevdet.ch/cevdet-haran.jpg');
});

test('readPortraitSize reads the dimensions from the file, and nothing when it is missing', async () => {
  assert.deepEqual(await readPortraitSize(await jpeg(400)), { width: 400, height: 400 });
  assert.equal(await readPortraitSize('/nonexistent/cevdet-haran.jpg'), undefined);
});
