import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { placePhoto, runRenderCv, typstPackages } from '../../src/cv/render.ts';

test('the vendored packages hold every Typst package the template downloads', async () => {
  await access(`${typstPackages}/preview/fontawesome/0.6.0/lib.typ`);
  await access(`${typstPackages}/preview/fontawesome/0.6.0/LICENSE`);
});

test('RenderCV runs against a Typst cache that holds only the vendored packages', async () => {
  const check = 'test "$(readlink "$XDG_CACHE_HOME/typst/packages")" = "$1" && test -f "$XDG_CACHE_HOME/typst/packages/preview/fontawesome/0.6.0/typst.toml"';
  await runRenderCv(['-c', check, 'sh', typstPackages], process.cwd(), 'sh');
  await assert.rejects(runRenderCv(['-c', 'exit 3'], process.cwd(), 'sh'), /exited with 3/);
});

test('placePhoto copies the portrait next to the model and returns its name, or nothing when there is none', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cv-photo-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'source.jpg');
  await writeFile(source, 'jpeg');
  assert.equal(await placePhoto(source, join(dir, 'work')), 'source.jpg');
  assert.equal(await readFile(join(dir, 'work', 'source.jpg'), 'utf8'), 'jpeg');
  assert.equal(await placePhoto(join(dir, 'missing.jpg'), join(dir, 'work')), undefined);
});
