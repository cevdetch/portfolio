import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hrefs, jsonLdBlocks, metaContents, visibleText } from '../../src/gates/html.ts';
import { checkJsonLd } from '../../src/gates/jsonld.ts';
import {
  denylistStatus, findDenylistTerms, findPrivacyViolations, isScannedTextFile, parseDenylist, splitCommitLog,
} from '../../src/gates/privacy.ts';

const page = `<!doctype html><html lang="en"><head><title>Cevdet - Software Developer</title>
<meta name="theme-color" content="#5685AD">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Person","@id":"https://cevdet.ch/#person","name":"Cevdet","jobTitle":"Software Developer","description":"Builds tools."},{"@type":"WebSite","@id":"https://cevdet.ch/#website","name":"Cevdet"}]}</script>
</head><body><h1>Cevdet</h1><p>Software   Developer</p><p>Builds tools.</p><a href="mailto:hello@cevdet.ch?subject=Hi">mail</a><script>var hidden = 1</script></body></html>`;

test('html helpers read what a reader and a crawler see', () => {
  assert.equal(visibleText(page), 'Cevdet Software Developer Builds tools. mail');
  assert.equal(jsonLdBlocks(page).length, 1);
  assert.deepEqual(metaContents(page, 'theme-color'), ['#5685AD']);
  assert.deepEqual(hrefs(page), ['mailto:hello@cevdet.ch?subject=Hi']);
});

test('JSON-LD claims must be visible on the page', () => {
  assert.deepEqual(checkJsonLd(jsonLdBlocks(page), visibleText(page), hrefs(page)), []);
  const hidden = page.replace('<p>Builds tools.</p>', '');
  assert.deepEqual(checkJsonLd(jsonLdBlocks(hidden), visibleText(hidden), hrefs(hidden)), ['https://cevdet.ch/#person description is not visible: "Builds tools."']);
  assert.deepEqual(checkJsonLd(['{bad'], '', []), ['JSON-LD block 0 is not valid JSON']);
});

test('every Person sameAs URL must be a link on the same page', () => {
  const person = '{"@type":"Person","@id":"https://cevdet.ch/#person","name":"Cevdet","sameAs":["https://github.com/cevdetch","https://www.npmjs.com/~cevdetch"]}';
  const linked = `<html><body><p>Cevdet</p><a href="https://github.com/cevdetch">GitHub</a><a href="https://www.npmjs.com/~cevdetch">npm</a></body></html>`;
  assert.deepEqual(checkJsonLd([person], visibleText(linked), hrefs(linked)), []);
  const unlinked = linked.replace('<a href="https://www.npmjs.com/~cevdetch">npm</a>', '<p>npm</p>');
  assert.deepEqual(checkJsonLd([person], visibleText(unlinked), hrefs(unlinked)),
    ['https://cevdet.ch/#person sameAs is not linked on the page: "https://www.npmjs.com/~cevdetch"']);
});

test('privacy rules catch every private category', () => {
  const found = (text: string) => findPrivacyViolations(text, []);
  assert.deepEqual(found('Call +41 79 123 45 67'), ['phone number']);
  assert.deepEqual(found('server at 192.168.1.20'), ['IPv4 address']);
  assert.deepEqual(found('box.tail1234.ts.net'), ['tailnet hostname']);
  assert.deepEqual(found('nas.lan and printer.local'), ['local hostname']);
  assert.deepEqual(found('weekdays after 17:00'), ['clock time']);
  assert.deepEqual(found('merged 2026-10-27T15:07:03Z'), []);
  assert.deepEqual(found('Ask on WhatsApp'), ['WhatsApp']);
  assert.deepEqual(found('Builds fast sites in Astro 7.4.2'), []);
});

test('deny-list hits are reported by position, never by term', () => {
  assert.deepEqual(findPrivacyViolations('Hello Secretname', ['secretname']), ['deny-list term #1']);
});

test('the deny list alone skips the generic rules, for files that hold test fixtures', () => {
  assert.deepEqual(findDenylistTerms('Call +41 79 123 45 67, Secretname, at 192.168.1.20', ['other', 'secretname']), ['deny-list term #2']);
  assert.deepEqual(findDenylistTerms('nothing here', ['secretname']), []);
});

test('deny-list parsing drops blank lines and padding', () => {
  assert.deepEqual(parseDenylist('  one \n\n two\r\n'), ['one', 'two']);
  assert.deepEqual(parseDenylist(''), []);
});

test('an empty deny list fails in CI and only warns locally', () => {
  assert.deepEqual(denylistStatus(0, true), { error: 'PRIVACY_DENYLIST secret is empty or missing' });
  assert.match(denylistStatus(0, false).warning ?? '', /^warning: no deny-list terms/);
  assert.equal(denylistStatus(0, false).error, undefined);
  assert.deepEqual(denylistStatus(2, true), {});
});

test('tracked binaries are not scanned as text', () => {
  for (const path of ['public/icon-192.png', 'public/favicon.ico', 'src/assets/social-fonts/NotoSans-Regular.ttf', 'a.pdf', 'a.woff', 'a.WOFF2']) {
    assert.equal(isScannedTextFile(path), false, path);
  }
  for (const path of ['README.md', 'public/icon.svg', 'src/facts/snapshot.json']) {
    assert.equal(isScannedTextFile(path), true, path);
  }
});

test('vendored packages under cv/typst-packages/ are skipped', () => {
  assert.equal(isScannedTextFile('cv/typst-packages/preview/fontawesome/0.6.0/lib.typ'), false);
  assert.equal(isScannedTextFile('cv/typst-packages/something.txt'), false);
  assert.equal(isScannedTextFile('src/content/cv.md'), true);
});

test('the commit log splits into commits and their messages', () => {
  assert.deepEqual(splitCommitLog('abc1234\nfeat: one\n\nWhy one.\n\0\ndef5678\nfix: two\n\0'), [
    { commit: 'abc1234', message: 'feat: one\n\nWhy one.\n' },
    { commit: 'def5678', message: 'fix: two\n' },
  ]);
  assert.deepEqual(splitCommitLog(''), []);
});
