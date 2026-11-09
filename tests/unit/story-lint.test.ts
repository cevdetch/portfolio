import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caseStudyHeadings, lintText } from '../../src/data/story-lint.ts';

test('placeholders fail everywhere', () => {
  for (const text of ['Lorem ipsum', 'TODO: write', 'Coming soon', 'TBD']) {
    assert.match(lintText('x', text, false).join(), /placeholder/);
  }
});

test('a hand-written version is a Fact in the wrong place', () => {
  assert.match(lintText('x', 'Released v0.3.1 in October', false).join(), /version/);
  assert.deepEqual(lintText('x', 'Supports Astro 7 and Node 24', false), []);
});

test('CV-shared Story is pronoun-free; i.e. and US are not pronouns', () => {
  assert.match(lintText('x', 'I built a linter', true).join(), /pronoun/);
  assert.match(lintText('x', 'Their sites load fast', true).join(), /pronoun/);
  assert.deepEqual(lintText('x', 'Builds linters, i.e. tools for HTML', true), []);
  assert.deepEqual(lintText('x', 'I built a linter', false), []);
});

test('Case study headings are read outside code fences', () => {
  const body = '## Problem\n\n```md\n## Not a heading\n```\n\n## Constraints\n';
  assert.deepEqual(caseStudyHeadings(body), ['Problem', 'Constraints']);
});
