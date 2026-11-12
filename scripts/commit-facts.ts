import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function parsePorcelain(z: string): { changed: string[]; deleted: string[] } {
  const changed: string[] = [];
  const deleted: string[] = [];
  for (const record of z.split('\0').filter(Boolean)) {
    if (record.length < 4 || record[2] !== ' ') {
      throw new Error(`Unexpected git status record: ${record}`);
    }
    const status = record.slice(0, 2);
    const path = record.slice(3);
    (status.includes('D') ? deleted : changed).push(path);
  }
  return { changed, deleted };
}

export function commitMessage(lines: readonly string[]): { headline: string; body: string } {
  return {
    headline: 'chore(facts): refresh the snapshot',
    body: `${lines.join('\n')}\n\nRefreshed by the weekly fetch-facts workflow after the gates passed.`,
  };
}

// createCommitOnBranch commits through the API, so GitHub signs the commit.
const mutation = `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }`;

if (import.meta.main) {
  try {
    const token = process.env['GITHUB_TOKEN'];
    const repo = process.env['GITHUB_REPOSITORY'];
    const branch = process.env['GITHUB_REF_NAME'];
    const changesFile = process.argv[2];
    if (!token || !repo || !branch || !changesFile) throw new Error('Needs GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_REF_NAME and a changes file.');
    const lines = readFileSync(changesFile, 'utf8').split('\n').filter(Boolean);
    const { changed, deleted } = parsePorcelain(execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--', 'src/facts'], { encoding: 'utf8' }));
    if (!lines.length || !changed.length && !deleted.length) { console.log('Nothing to commit.'); process.exit(0); }
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: mutation, variables: { input: {
        branch: { repositoryNameWithOwner: repo, branchName: branch },
        expectedHeadOid: head,
        message: commitMessage(lines),
        fileChanges: {
          additions: changed.map(path => ({ path, contents: readFileSync(path).toString('base64') })),
          deletions: deleted.map(path => ({ path })),
        },
      } } }),
    });
    const result = await response.json() as { data?: { createCommitOnBranch: { commit: { url: string } } }; errors?: unknown[] };
    if (!response.ok || result.errors) throw new Error(`Commit failed: ${JSON.stringify(result.errors ?? response.status)}`);
    console.log(`Committed ${result.data!.createCommitOnBranch.commit.url}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
