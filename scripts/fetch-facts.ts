import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { createClient } from '../src/facts/client.ts';
import { collectFacts, highlightedPulls, type WorkSource } from '../src/facts/refresh.ts';
import { snapshotSchema, type Snapshot } from '../src/facts/schema.ts';
import { describeChanges, mergeSnapshot, stableJson } from '../src/facts/snapshot.ts';
import { createPageSpeed } from '../src/facts/sources/pagespeed.ts';
import { contributionOverridesSchema } from '../src/schemas/contributions.ts';
import { workSchema } from '../src/schemas/work.ts';

const root = new URL('../', import.meta.url);

export async function readWorkSources(dir: URL): Promise<WorkSource[]> {
  const names = (await readdir(dir)).filter(name => /^[a-z0-9-]+\.mdx$/.test(name)).sort();
  return Promise.all(names.map(async name => {
    const text = await readFile(new URL(name, dir), 'utf8');
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    if (front === undefined) throw new Error(`${name}: no frontmatter`);
    const work = workSchema.parse(parse(front));
    return {
      id: name.slice(0, -'.mdx'.length),
      ...(work.repo ? { repo: work.repo } : {}),
      ...(work.site ? { site: work.site } : {}),
      packages: work.packages,
      pkgbuilds: work.pkgbuilds,
      ...(work.rules ? { rules: true } : {}),
    };
  }));
}

async function readSnapshot(file: URL): Promise<Snapshot | undefined> {
  try { return snapshotSchema.parse(JSON.parse(await readFile(file, 'utf8'))); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

if (import.meta.main) {
  try {
    const token = process.env['GITHUB_TOKEN'];
    if (!token) throw new Error('Set GITHUB_TOKEN, e.g. GITHUB_TOKEN=$(gh auth token) pnpm fetch-facts');
    const flag = process.argv.indexOf('--changes-file');
    const changesFile = flag === -1 ? undefined : process.argv[flag + 1];
    const facts = new URL('src/facts/', root);
    const snapshotFile = new URL('snapshot.json', facts);
    const previous = await readSnapshot(snapshotFile);
    const overrides = contributionOverridesSchema.parse(parse(await readFile(new URL('src/content/contributions.yaml', root), 'utf8')));
    const collected = await collectFacts(await readWorkSources(new URL('src/content/work/', root)), createClient(token), {
      highlights: highlightedPulls(overrides), previous,
      // From the environment or the gitignored .env; without it every site keeps its last scores, with a warning.
      lighthouse: createPageSpeed(process.env['PSI_API_KEY']),
      warn: message => console.warn(`warning: ${message}`),
    });
    const { snapshot, changed } = mergeSnapshot(previous, collected, new Date());
    const lines = changed ? describeChanges(previous, snapshot) : [];
    if (changed) {
      // Icons first, then the Snapshot that points at them; nothing is written if any fetch failed.
      const icons = new URL('icons/', facts);
      await rm(icons, { recursive: true, force: true });
      await mkdir(icons, { recursive: true });
      for (const icon of collected.icons) await writeFile(new URL(`${icon.workId}.svg`, icons), icon.svg);
      await writeFile(snapshotFile, stableJson(snapshotSchema.parse(snapshot)));
    }
    console.log(changed ? lines.join('\n') : 'Facts unchanged.');
    if (changesFile) await writeFile(changesFile, lines.length ? `${lines.join('\n')}\n` : '');
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
