import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { updateReleasePr } from './update-release-pr.mjs';

const repository = 'imsergiobernal/vaia';
const env = { GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: repository,
  RELEASE_BRANCH: 'release/sdk-v0.1.0', GITHUB_REF: 'refs/heads/release/sdk-v0.1.0' };

function fixture(t, { reviewed = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'vaia-draft-'));
  t.after(() => { assert.equal(dirname(cwd), resolve(tmpdir())); rmSync(cwd, { recursive: true, force: true }); });
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path, content) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), content); };
  const commit = (message) => { git('add', '.'); git('commit', '-m', message); return git('rev-parse', 'HEAD'); };
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  write('packages/sdk/package.json', JSON.stringify({ version: '0.1.0' }));
  write('packages/sdk/src/client.ts', 'export const feature = 1;\n');
  const candidate = commit('feat(sdk): add feature');
  const marker = `<!-- vaia-release-notes ${JSON.stringify({ component: 'sdk', version: '0.1.0', candidate, previous_tag: null })} -->`;
  const entry = `## 0.1.0\n\n### Features\n\n* Editorial notes for the feature.\n${reviewed ? `\n${marker}\n` : ''}`;
  write('packages/sdk/CHANGELOG.md', `# Changelog\n\n${entry}\n`);
  const head = commit('docs(release): prepare sdk notes');
  const repo = { full_name: repository };
  const pr = { number: 42, state: 'open', merged: false, body: 'Human-written PR description.',
    base: { ref: 'main', sha: candidate, repo }, head: { ref: env.RELEASE_BRANCH, sha: head, repo } };
  return { cwd, git, write, commit, pr, entry, candidate };
}

function transport(pr, onFinalRead) {
  const current = structuredClone(pr);
  let reads = 0;
  const calls = [];
  return { current, calls, request: async (method, path, payload) => {
    calls.push({ method, path, payload });
    if (method === 'GET' && path === 'pulls/42') {
      if (++reads === 2) onFinalRead?.(current);
      return structuredClone(current);
    }
    if (method === 'PATCH' && path === 'pulls/42') { current.body = payload.body; return {}; }
    assert.fail(`Unexpected request: ${method} ${path}`);
  } };
}

const draft = '## 0.1.0\n\n### Features\n\n* Automatic feature from commit.\n';

test('adds a current automatic draft, preserves human text and does not commit notes', async (t) => {
  const f = fixture(t);
  const api = transport(f.pr);
  const before = f.git('rev-parse', 'HEAD');
  const first = await updateReleasePr(42, draft, { ...f, env, request: api.request });
  assert.deepEqual(first, { changed: true, status: 'review-required' });
  assert.match(api.current.body, /Human-written PR description/);
  assert.match(api.current.body, /Editorial review required/);
  assert.match(api.current.body, /Automatic feature from commit/);
  assert.doesNotMatch(api.current.body, /<!-- vaia-release-notes-sync:start -->/);
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(readFileSync(join(f.cwd, 'packages/sdk/CHANGELOG.md'), 'utf8'), `# Changelog\n\n${f.entry}\n`);
  const second = await updateReleasePr(42, draft, { ...f, env, request: api.request });
  assert.equal(second.changed, false);
  assert.equal(api.calls.filter((call) => call.method === 'PATCH').length, 1);
});

test('retains editorial notes, warns when the candidate changes, and refreshes the draft', async (t) => {
  const f = fixture(t, { reviewed: true });
  const api = transport(f.pr);
  const first = await updateReleasePr(42, draft, { ...f, env, request: api.request });
  assert.equal(first.status, 'current');
  assert.match(api.current.body, /Editorial notes match the current candidate/);
  assert.match(api.current.body, /Editorial notes for the feature/);
  const initialChangelog = readFileSync(join(f.cwd, 'packages/sdk/CHANGELOG.md'), 'utf8');
  f.write('packages/sdk/src/client.ts', 'export const feature = 2;\n');
  api.current.head.sha = f.commit('fix(sdk): change feature');
  const refreshed = draft.replace('Automatic feature from commit', 'Updated automatic feature');
  const second = await updateReleasePr(42, refreshed, { ...f, env, request: api.request });
  assert.equal(second.status, 'review-required');
  assert.match(api.current.body, /Editorial review required/);
  assert.match(api.current.body, /Updated automatic feature/);
  assert.match(api.current.body, /Editorial notes for the feature/);
  assert.doesNotMatch(api.current.body, /Editorial notes match the current candidate/);
  assert.equal(readFileSync(join(f.cwd, 'packages/sdk/CHANGELOG.md'), 'utf8'), initialChangelog);

  const newCandidate = api.current.head.sha;
  const revised = `# Changelog\n\n## 0.1.0\n\n### Features\n\n* Revised editorial notes.\n\n<!-- vaia-release-notes ${JSON.stringify({ component: 'sdk', version: '0.1.0', candidate: newCandidate, previous_tag: null })} -->\n`;
  f.write('packages/sdk/CHANGELOG.md', revised);
  api.current.head.sha = f.commit('docs(release): revise sdk notes');
  const third = await updateReleasePr(42, refreshed, { ...f, env, request: api.request });
  assert.equal(third.status, 'current');
  assert.match(api.current.body, /Revised editorial notes/);
  assert.doesNotMatch(api.current.body, /Editorial notes for the feature/);
  assert.match(api.current.body, /Updated automatic feature/);
  assert.equal((api.current.body.match(/<!-- vaia-release-draft:start -->/g) ?? []).length, 1);
});

test('rejects changed PRs, unsafe refs and injected managed markers before updating', async (t) => {
  const f = fixture(t, { reviewed: true });
  for (const mutate of [
    (pr) => { pr.head.sha = f.candidate; },
    (pr) => { pr.head.repo.full_name = 'someone/vaia'; },
    (pr) => { pr.base.ref = 'develop'; },
    (pr) => { pr.state = 'closed'; },
  ]) {
    const pr = structuredClone(f.pr); mutate(pr);
    const api = transport(pr);
    await assert.rejects(updateReleasePr(42, draft, { ...f, env, request: api.request }));
    assert(api.calls.every((call) => call.method === 'GET'));
  }
  const api = transport(f.pr, (pr) => { pr.body += '\nAnother edit'; });
  await assert.rejects(updateReleasePr(42, draft, { ...f, env, request: api.request }), /changed during synchronization/);
  assert(api.calls.every((call) => call.method === 'GET'));
  const injected = transport(f.pr);
  await assert.rejects(updateReleasePr(42, `${draft}\n<!-- vaia-release-notes-sync:end -->`, { ...f, env, request: injected.request }), /reserved/);
  assert(injected.calls.every((call) => call.method === 'GET'));
  let contacted = false;
  await assert.rejects(updateReleasePr(42, draft, { ...f, env: { ...env, GITHUB_EVENT_NAME: 'pull_request' }, request: async () => { contacted = true; } }));
  assert.equal(contacted, false);
});
