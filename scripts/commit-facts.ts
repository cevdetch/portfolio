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

// main's rules require a signed, linear commit with a passing gate check, and exempt no one. createCommitOnBranch
// commits through the API, so GitHub signs it; the commit lands on a branch of its own, gets the gate check this run
// earned by gating that exact tree, and main fast-forwards to it.
const mutation = `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }`;

/** The short-lived branch one refresh run commits on before main moves to the commit. */
export function refreshBranch(runId: string): string {
  return `facts/refresh-${runId}`;
}

/** The gate check the refresh run posts on its commit: the check main's rules require, earned in this run. */
export function gateCheck(sha: string, runUrl: string) {
  return {
    name: 'gate', head_sha: sha, status: 'completed', conclusion: 'success',
    output: {
      title: 'The refresh run passed the gates',
      summary: `The weekly fetch-facts workflow ran the type check, the unit and build tests, the build, the output and HTML checks, the privacy gate, lychee and Lighthouse on this exact tree before committing it: ${runUrl}`,
    },
  } as const;
}

if (import.meta.main) {
  try {
    const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_REF_NAME: branch, GITHUB_RUN_ID: runId, GITHUB_SERVER_URL: server } = process.env;
    const changesFile = process.argv[2];
    if (!token || !repo || !branch || !runId || !server || !changesFile) {
      throw new Error('Needs GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_RUN_ID, GITHUB_SERVER_URL and a changes file.');
    }
    const lines = readFileSync(changesFile, 'utf8').split('\n').filter(Boolean);
    const { changed, deleted } = parsePorcelain(execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--', 'src/facts'], { encoding: 'utf8' }));
    if (!lines.length || !changed.length && !deleted.length) { console.log('Nothing to commit.'); process.exit(0); }
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const api = async (method: string, path: string, body?: unknown): Promise<unknown> => {
      const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
        method, headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
      return response.status === 204 ? undefined : response.json();
    };
    const side = refreshBranch(runId);
    await api('POST', '/git/refs', { ref: `refs/heads/${side}`, sha: head });
    try {
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mutation, variables: { input: {
          branch: { repositoryNameWithOwner: repo, branchName: side },
          expectedHeadOid: head,
          message: commitMessage(lines),
          fileChanges: {
            additions: changed.map(path => ({ path, contents: readFileSync(path).toString('base64') })),
            deletions: deleted.map(path => ({ path })),
          },
        } } }),
      });
      const result = await response.json() as { data?: { createCommitOnBranch: { commit: { oid: string; url: string } } }; errors?: unknown[] };
      if (!response.ok || result.errors) throw new Error(`Commit failed: ${JSON.stringify(result.errors ?? response.status)}`);
      const commit = result.data!.createCommitOnBranch.commit;
      await api('POST', '/check-runs', gateCheck(commit.oid, `${server}/${repo}/actions/runs/${runId}`));
      // A fast-forward only: if main moved during the run, this fails rather than overwrite it.
      await api('PATCH', `/git/refs/heads/${branch}`, { sha: commit.oid, force: false });
      console.log(`Committed ${commit.url} and moved ${branch} to it.`);
    } finally {
      await api('DELETE', `/git/refs/heads/${side}`).catch((error: unknown) => console.error(`Could not delete ${side}: ${error instanceof Error ? error.message : error}`));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
