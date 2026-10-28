import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSyncPullRequest } from './validate-sync-pr.mjs';

const repo = 'imsergiobernal/vaia';
const sha = 'a'.repeat(40);
const pull = () => ({ merged: true, merge_commit_sha: sha,
  base: { ref: 'main', repo: { full_name: repo } },
  head: { ref: 'release/sdk-v0.1.0', repo: { full_name: repo } } });

test('accepts merged same-repository release and hotfix PRs', () => {
  const pr = pull();
  assert.equal(validateSyncPullRequest(pr, repo), sha);
  pr.head.ref = 'hotfix/cli-v1.2.3';
  assert.equal(validateSyncPullRequest(pr, repo), sha);
});

test('rejects closed unmerged PRs, other bases, forks and invalid refs or SHAs', () => {
  const invalid = [
    { ...pull(), merged: false },
    { ...pull(), base: { ...pull().base, ref: 'develop' } },
    { ...pull(), base: { ...pull().base, repo: { full_name: 'other/vaia' } } },
    { ...pull(), head: { ...pull().head, repo: { full_name: 'other/vaia' } } },
    { ...pull(), head: { ...pull().head, repo: null } },
    { ...pull(), head: { ...pull().head, ref: 'release/other-v1.0.0' } },
    { ...pull(), merge_commit_sha: 'bad' },
  ];
  for (const pr of invalid) assert.throws(() => validateSyncPullRequest(pr, repo));
});
