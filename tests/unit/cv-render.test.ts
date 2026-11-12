import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { test } from 'node:test';
import { runRenderCv, typstPackages } from '../../src/cv/render.ts';

test('the vendored packages hold every Typst package the template downloads', async () => {
  await access(`${typstPackages}/preview/fontawesome/0.6.0/lib.typ`);
  await access(`${typstPackages}/preview/fontawesome/0.6.0/LICENSE`);
});

test('RenderCV runs against a Typst cache that holds only the vendored packages', async () => {
  const check = 'test "$(readlink "$XDG_CACHE_HOME/typst/packages")" = "$1" && test -f "$XDG_CACHE_HOME/typst/packages/preview/fontawesome/0.6.0/typst.toml"';
  await runRenderCv(['-c', check, 'sh', typstPackages], process.cwd(), 'sh');
  await assert.rejects(runRenderCv(['-c', 'exit 3'], process.cwd(), 'sh'), /exited with 3/);
});
