import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { checkJsonLd } from '../src/gates/jsonld.ts';
import { pdfPageCount } from '../src/gates/pdf.ts';
import { checkPortrait } from '../src/gates/portrait.ts';
import { hrefs, jsonLdBlocks, metaContents, visibleText } from '../src/gates/html.ts';
import { denylistStatus, findDenylistTerms, findPrivacyViolations, isScannedTextFile, parseDenylist, splitCommitLog } from '../src/gates/privacy.ts';
import { readBuildReceipt } from '../src/integrations/receipt.ts';
import { portraitOutputs } from '../src/data/portrait.ts';

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter(entry => entry.isFile() && /\.(?:html|xml|txt|json|webmanifest)$/.test(entry.name))
    .map(entry => `${entry.parentPath}/${entry.name}`);
}

async function denylist(): Promise<string[]> {
  const raw = process.env['PRIVACY_DENYLIST'] ?? await readFile('.privacy-denylist', 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  return parseDenylist(raw);
}

const git = async (...args: string[]) => (await promisify(execFile)('git', args, { maxBuffer: 64 * 1024 * 1024 })).stdout;

// The branch's own commits; the whole history when the template's root commit is absent.
async function commitMessages() {
  const base = 'c2e3c1c';
  const known = await git('cat-file', '-e', `${base}^{commit}`).then(() => true, () => false);
  return splitCommitLog(await git('log', '-z', '--format=%h%n%B', ...(known ? [`${base}..HEAD`] : [])));
}

// Tracked files and commit messages get the deny list only: the tests hold phone and IP fixtures on purpose.
async function denylistHits(terms: readonly string[]): Promise<{ hits: string[]; files: number; commits: number }> {
  if (!terms.length) return { hits: [], files: 0, commits: 0 };
  const hits: string[] = [];
  const tracked = (await git('ls-files', '-z')).split('\0').filter(path => path && isScannedTextFile(path));
  for (const path of tracked) {
    const text = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    hits.push(...findDenylistTerms(text, terms).map(hit => `${path}: privacy: ${hit}`));
  }
  const commits = await commitMessages();
  for (const { commit, message } of commits) {
    hits.push(...findDenylistTerms(message, terms).map(hit => `commit ${commit} message: privacy: ${hit}`));
  }
  return { hits, files: tracked.length, commits: commits.length };
}

if (import.meta.main) {
  try {
    const root = pathToFileURL(`${process.cwd()}/`);
    const receipt = await readBuildReceipt(root);
    const brand = JSON.parse(await readFile(new URL('src/brand.json', root), 'utf8')) as { themeColor: string; primary: { hex: string } };
    const profile = await readFile(new URL('src/content/profile.yaml', root), 'utf8');
    const email = profile.match(/^email:\s*(\S+)/m)?.[1];
    const errors: string[] = [];
    if (brand.themeColor !== brand.primary.hex) errors.push('brand.json themeColor differs from the palette primary');
    // The public CV is one page by design; RenderCV happily spills onto a second.
    const cvPages = pdfPageCount(await readFile(new URL('cv.pdf', receipt.outDir)));
    if (cvPages !== 1) errors.push(`cv.pdf: ${cvPages} pages; the CV must fit on one`);
    for (const page of receipt.pages) {
      const html = await readFile(new URL(page.file), 'utf8');
      const where = new URL(page.url).pathname;
      if (!page.owned) continue;
      const colours = metaContents(html, 'theme-color');
      if (colours.length !== 1 || colours[0] !== brand.primary.hex) errors.push(`${where}: theme-color must be ${brand.primary.hex}`);
      errors.push(...checkJsonLd(jsonLdBlocks(html), visibleText(html), hrefs(html)).map(error => `${where}: ${error}`));
      if (where === '/hire/' && !hrefs(html).some(href => href.startsWith(`mailto:${email}?subject=`))) errors.push('/hire/: no mailto link with a prefilled subject');
    }
    // Every committed portrait: no EXIF, XMP or IPTC, so no location or camera data is published with it.
    const portraits = (await git('ls-files', '-z', '--', ...portraitOutputs.map(output => output.path))).split('\0').filter(Boolean);
    for (const path of portraits) errors.push(...(await checkPortrait(await readFile(path))).map(error => `${path}: ${error}`));
    const terms = await denylist();
    const status = denylistStatus(terms.length, Boolean(process.env['CI']));
    if (status.error) errors.push(status.error);
    if (status.warning) console.warn(status.warning);
    const history = await denylistHits(terms);
    errors.push(...history.hits);
    const scanned = [...await files(fileURLToPath(receipt.outDir)), '.astro/cv/cv.yaml', 'src/facts/snapshot.json'];
    for (const file of scanned) {
      for (const hit of findPrivacyViolations(await readFile(file, 'utf8'), terms)) errors.push(`${file}: privacy: ${hit}`);
    }
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log(`Portfolio output verified: ${receipt.pages.length} pages, ${scanned.length} files scanned, ${terms.length} deny-list terms`
      + (terms.length ? `, also checked against ${history.files} tracked files and ${history.commits} commit messages.` : '.'));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
