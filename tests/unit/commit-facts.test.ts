import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commitMessage, parsePorcelain } from '../../scripts/commit-facts.ts';

test('porcelain -z output splits into changed and deleted paths', () => {
  assert.deepEqual(parsePorcelain(' M src/facts/snapshot.json\0?? src/facts/icons/new.svg\0 D src/facts/icons/old.svg\0'), {
    changed: ['src/facts/snapshot.json', 'src/facts/icons/new.svg'],
    deleted: ['src/facts/icons/old.svg'],
  });
});

test('the commit message is a Conventional Commit listing every Fact change', () => {
  assert.deepEqual(commitMessage(['deadhead: npm deadhead 0.3.1 → 0.4.0']), {
    headline: 'chore(facts): refresh the snapshot',
    body: 'deadhead: npm deadhead 0.3.1 → 0.4.0\n\nRefreshed by the weekly fetch-facts workflow after the gates passed.',
  });
});

test('a deletion plus an untracked addition (the --no-renames shape of a rename) parses correctly', () => {
  assert.deepEqual(parsePorcelain(' D src/facts/icons/old.svg\0?? src/facts/icons/new.svg\0'), {
    changed: ['src/facts/icons/new.svg'],
    deleted: ['src/facts/icons/old.svg'],
  });
});

test('a bare-path record throws Unexpected git status record error', () => {
  assert.throws(
    () => parsePorcelain('R  a.svg\0b.svg\0'),
    /Unexpected git status record/,
  );
});
