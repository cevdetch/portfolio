import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import sharp from 'sharp';
import type { SocialJob } from '../../src/integrations/social-images.ts';
import type { CardBrand } from '../../src/lib/social-card.ts';

const repo = (path: string) => new URL(`../../${path}`, import.meta.url);
const fonts = async () => ({
  title: await readFile(repo('src/assets/social-fonts/Archivo-SemiCondensed-ExtraBold.woff')),
  line: await readFile(repo('src/assets/social-fonts/Archivo-SemiBold.woff')),
});
async function brand(): Promise<CardBrand> {
  const { cardPalette, markPaths } = await import('../../src/lib/social-card.ts');
  const text = (path: string) => readFile(repo(path), 'utf8');
  return { name: 'Cevdet Haran', role: 'Software Developer',
    palette: cardPalette(await text('src/styles/tokens.css'), await text('src/styles/brand.css')), mark: markPaths(await text('public/icon.svg')) };
}
const input = { pageUrl: 'https://example.test/a/', title: 'Hello & welcome', description: 'Keep the full description.', lang: 'en' };
const png = () => sharp({ create: { width: 1200, height: 630, channels: 3, background: '#fafafa' } }).png().toBuffer();
async function setup(t: { after(fn: () => Promise<void>): void }, count = 2) {
  const dir = pathToFileURL(`${await mkdtemp(join(tmpdir(), 'starter-social-test-'))}/`);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const jobs: SocialJob[] = [];
  for (let i = 0; i < count; i++) {
    const pageUrl = `https://example.test/page-${i}/`;
    const hash = createHash('sha256').update(`/page-${i}/`).digest('hex');
    const imageUrl = `https://example.test/_social/${hash}.png`;
    const file = new URL(`page-${i}.html`, dir);
    await writeFile(file, `<html lang="en"><head data-starter-social-v1="${imageUrl}"><title>Fixture</title><meta name="description" content="Original"><meta property="og:image" content="${imageUrl}"></head><body>Untouched &amp; bytes</body></html>`);
    jobs.push({ ...input, title: 'Fixture', description: 'Original', pageUrl, file, imageUrl });
  }
  return { dir, site: new URL('https://example.test'), base: '/', jobs };
}

test('empty run skips loader', async t => {
  const { runSocialJobs } = await import('../../src/integrations/social-images.ts');
  let loads = 0;
  const result = await runSocialJobs(await setup(t, 0), async () => { loads++; throw new Error('must not load'); });
  assert.deepEqual(result, { rendered: 0, rendererLoads: 0 });
  assert.equal(loads, 0);
});

test('renderer emits decoded PNG while preserving full metadata inputs', async () => {
  const { createRenderer } = await import('../../src/lib/social-renderer.ts');
  const renderer = await createRenderer(await fonts(), await brand());
  for (const title of ['Hello & welcome', 'Café Ærøskøbing Łódź Đà Nẵng', 'W'.repeat(500), 'Measure '.repeat(16), 'deadhead - Cevdet Haran']) {
    const value = { ...input, title };
    const before = structuredClone(value);
    const bytes = await renderer.render(value);
    const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 1200); assert.equal(info.height, 630);
    assert.equal((await sharp(bytes).metadata()).format, 'png');
    assert.deepEqual(value, before);
    assert.ok(bytes.length <= 150 * 1024);
  }
});

test('renderer rejects unsupported text and explicit or implicit RTL with page remedies', async () => {
  const { createRenderer } = await import('../../src/lib/social-renderer.ts');
  const renderer = await createRenderer(await fonts(), await brand());
  // Archivo covers Latin, Latin Extended and Vietnamese: other scripts are refused, never drawn as boxes.
  for (const value of [{ title: 'bad \u{10ffff}' }, { title: 'Hi 😀' }, { dir: 'rtl' as const }, { title: 'مرحبا' }, { title: 'Ελληνικά' }, { title: 'Кириллица' }]) {
    await assert.rejects(() => renderer.render({ ...input, ...value }), /example\.test\/a\/.*manual image.*image=false/s);
  }
});

test('written PNG validation reads saved bytes and fully decodes image data', async t => {
  const { verifyWrittenPng } = await import('../../src/integrations/social-images.ts');
  const { dir } = await setup(t, 0);
  const file = new URL('image.png', dir);
  const bytes = await png();
  await writeFile(file, bytes);
  await verifyWrittenPng(file, input.pageUrl);
  // IHDR survives, but truncation removes the compressed pixel payload.
  const corrupt = bytes.subarray(0, 64);
  assert.equal((await sharp(corrupt).metadata()).width, 1200);
  await assert.rejects(() => sharp(corrupt).raw().toBuffer());
  for (const invalid of [corrupt, Buffer.from('not a PNG'), await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer(), await sharp(bytes).jpeg().toBuffer()]) {
    await writeFile(file, invalid);
    await assert.rejects(() => verifyWrittenPng(file, input.pageUrl), /example\.test\/a\//);
  }
});

test('jobs initialize once and remove only their own marker after verified writes', async t => {
  const { runSocialJobs } = await import('../../src/integrations/social-images.ts');
  const options = await setup(t);
  const originals = await Promise.all(options.jobs.map(job => readFile(job.file, 'utf8')));
  let loads = 0;
  const bytes = await png();
  const result = await runSocialJobs(options, async () => { loads++; return { render: async () => bytes }; });
  assert.equal(loads, 1); assert.deepEqual(result, { rendered: 2, rendererLoads: 1 });
  for (const [i, job] of options.jobs.entries()) {
    assert.equal(await readFile(job.file, 'utf8'), originals[i]!.replace(`data-starter-social-v1="${job.imageUrl}"`, ''));
    assert.deepEqual(await readFile(new URL(`_social/${new URL(job.imageUrl).pathname.split('/').at(-1)}`, options.dir)), bytes);
  }
});

test('jobs cap complete work at two and admit the next only after saved PNG and marker cleanup', { timeout: 15000 }, async t => {
  const { runSocialJobs, verifyWrittenPng } = await import('../../src/integrations/social-images.ts');
  const options = await setup(t, 3);
  const gates = options.jobs.map(() => Promise.withResolvers<Uint8Array>());
  const started = options.jobs.map(() => Promise.withResolvers<void>());
  let active = 0, maxActive = 0, calls = 0, loads = 0;
  const bytes = await png();
  const run = runSocialJobs(options, async () => { loads++; return { async render(job) {
    const n = options.jobs.findIndex(candidate => candidate.pageUrl === job.pageUrl); calls++; active++; maxActive = Math.max(active, maxActive);
    started[n]!.resolve();
    if (n === 2) {
      assert.doesNotMatch(await readFile(options.jobs[0]!.file, 'utf8'), /data-starter-social/);
      await verifyWrittenPng(new URL(`_social/${new URL(options.jobs[0]!.imageUrl).pathname.split('/').at(-1)}`, options.dir), options.jobs[0]!.pageUrl);
    }
    try { return await gates[n]!.promise; } finally { active--; }
  } }; });
  await Promise.all([started[0]!.promise, started[1]!.promise]);
  assert.equal(calls, 2); gates[0]!.resolve(bytes);
  await started[2]!.promise;
  gates[1]!.resolve(bytes); gates[2]!.resolve(bytes);
  assert.deepEqual(await run, { rendered: 3, rendererLoads: 1 });
  assert.equal(maxActive, 2); assert.equal(loads, 1);
});

test('first failure drains before rejection and later errors do not replace it', { timeout: 15000 }, async t => {
  const { runSocialJobs } = await import('../../src/integrations/social-images.ts');
  for (const failSecond of [false, true]) {
    const options = await setup(t, 3);
    const gates = [Promise.withResolvers<Uint8Array>(), Promise.withResolvers<Uint8Array>()];
    const both = Promise.withResolvers<void>();
    let calls = 0, settled = false;
    const firstError = new Error('first render error');
    const later = new Error('later render error');
    const run = runSocialJobs(options, async () => ({ render() { const i = calls++; if (calls === 2) both.resolve(); return gates[i]!.promise; } }));
    const rejected = assert.rejects(run, error => error === firstError).finally(() => { settled = true; });
    await both.promise; gates[0]!.reject(firstError);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 2); assert.equal(settled, false);
    if (failSecond) gates[1]!.reject(later); else gates[1]!.resolve(await png());
    await rejected; assert.equal(calls, 2);
  }
});

test('late write collision preserves consumer bytes while active work drains', { timeout: 15000 }, async t => {
  const { runSocialJobs } = await import('../../src/integrations/social-images.ts');
  const options = await setup(t, 2);
  let calls = 0;
  const gate = Promise.withResolvers<Uint8Array>();
  const bytes = await png();
  const collision = new URL(`_social/${new URL(options.jobs[0]!.imageUrl).pathname.split('/').at(-1)}`, options.dir);
  const run = runSocialJobs(options, async () => ({ async render(job) {
    calls++;
    if (job.pageUrl === options.jobs[0]!.pageUrl) { await mkdir(new URL('_social/', options.dir), { recursive: true }); await writeFile(collision, 'consumer'); return bytes; }
    return gate.promise;
  } }));
  const rejected = assert.rejects(run, /example\.test\/page-0\/.*write/s);
  await new Promise(resolve => setImmediate(resolve));
  gate.resolve(bytes); await rejected;
  assert.equal(calls, 2); assert.equal(await readFile(collision, 'utf8'), 'consumer');
});

test('invalid destinations and duplicate identities fail before loading', async t => {
  const { runSocialJobs } = await import('../../src/integrations/social-images.ts');
  const options = await setup(t);
  let loads = 0;
  const loader = async () => { loads++; return { render: png }; };
  const first = options.jobs[0]!;
  for (const jobs of [[first, first], [{ ...first, file: new URL('../outside.html', options.dir) }], [{ ...first, imageUrl: 'https://elsewhere.test/_social/a.png' }], [{ ...first, imageUrl: options.jobs[1]!.imageUrl }]]) {
    await assert.rejects(() => runSocialJobs({ ...options, jobs }, loader));
  }
  assert.equal(loads, 0);
});

test('invalid rendered PNG keeps its marker and fails the run', async t => {
  const { runSocialJobs } = await import('../../src/integrations/social-images.ts');
  const options = await setup(t, 1);
  await assert.rejects(() => runSocialJobs(options, async () => ({ render: async () => Buffer.from('invalid PNG') })), /page-0.*saved PNG verification/);
  assert.match(await readFile(options.jobs[0]!.file, 'utf8'), /data-starter-social-v1/);
});

test('marker cleanup write failure rejects after verifying its PNG', async t => {
  const { runSocialJobs, verifyWrittenPng } = await import('../../src/integrations/social-images.ts');
  const options = await setup(t, 1), job = options.jobs[0]!;
  await assert.rejects(() => runSocialJobs(options, async () => ({ async render() {
    await rm(job.file); await mkdir(job.file); return png();
  } })), /page-0.*marker cleanup/);
  await verifyWrittenPng(new URL(`_social/${new URL(job.imageUrl).pathname.split('/').at(-1)}`, options.dir), job.pageUrl);
});

test('the card reads its palette from the light scheme of the token files and its mark from the icon', async () => {
  const { cardPalette, lightTokens, markPaths } = await import('../../src/lib/social-card.ts');
  const neutrals = '@layer tokens { :root { --bg: #ffffff; --text: #111111; } @media (prefers-color-scheme: dark) { :root { --text: #eeeeee; } } }';
  const slots = '@layer tokens { :root { --brand: #0a0a0a; --brand-ink: #0b0b0b; --brand-bg: #0c0c0c; --cta: #0d0d0d; --cta-ink: #111111; } }';
  assert.deepEqual(lightTokens(neutrals), { '--bg': '#ffffff', '--text': '#111111' });
  assert.deepEqual(cardPalette(neutrals, slots), { text: '#111111', brand: '#0a0a0a', brandInk: '#0b0b0b', brandBg: '#0c0c0c', cta: '#0d0d0d' });
  assert.throws(() => cardPalette('@layer tokens { :root { --bg: #ffffff; } }', slots), /no --text/);
  assert.deepEqual(markPaths('<svg><path fill="x" d="M0 0h1v1H0z"/><path class="a" d="M2 0h1v1H2z"/></svg>'), { body: 'M0 0h1v1H0z', odd: 'M2 0h1v1H2z' });
  assert.throws(() => markPaths('<svg><path d="M0 0"/></svg>'), /1 paths/);
});

test('the card states the page, then who: the home title leads with the name, so its line is the role alone', async () => {
  const { cardText } = await import('../../src/lib/social-card.ts');
  const who = { name: 'Cevdet Haran', role: 'Software Developer' };
  assert.deepEqual(cardText('deadhead - Cevdet Haran', who), { heading: 'deadhead', line: 'Cevdet Haran · Software Developer' });
  assert.deepEqual(cardText('Cevdet Haran - Software Developer', who), { heading: 'Cevdet Haran', line: 'Software Developer' });
  assert.deepEqual(cardText('Untitled', who), { heading: 'Untitled', line: 'Cevdet Haran · Software Developer' });
});
