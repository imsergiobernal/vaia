import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  authorizeReleaseNotes, githubClient, releaseNotesContext, releaseNotesOwner,
  syncReleaseNotes, validateDraftProvenance,
} from './sync-release-notes.mjs';
import { extractReleaseNotes } from './release-notes.mjs';

const repository = 'imsergiobernal/vaia';
const ownerEnv = {
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: repository,
  GITHUB_REF: 'refs/heads/develop', GITHUB_ACTOR: 'imsergiobernal',
  GITHUB_ACTOR_ID: '20087388', GITHUB_TRIGGERING_ACTOR: 'imsergiobernal',
};

function fixture(t, { component = 'cli', firstRelease = false, provenance = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'vaia-notes-'));
  t.after(() => {
    assert.equal(dirname(cwd), resolve(tmpdir()));
    rmSync(cwd, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path, content) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  const commit = (message) => { git('add', '.'); git('commit', '-m', message); return git('rev-parse', 'HEAD'); };
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Release notes test');
  git('config', 'user.email', 'notes-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  write('apps/cli/package.json', JSON.stringify({ version: '0.1.0' }));
  write('apps/cli/src/command.ts', 'export const behaviour = "original";\n');
  write('packages/sdk/package.json', JSON.stringify({ version: '0.2.0' }));
  write('packages/sdk/src/client.ts', 'export const resource = "original";\n');
  const previousSha = commit('feat(cli,sdk): add initial resources');
  const version = component === 'cli' ? '0.2.0' : '0.3.0';
  const previousVersion = component === 'cli' ? '0.1.0' : '0.2.0';
  const previousTag = firstRelease ? null : `${component}-v${previousVersion}`;
  if (previousTag) git('tag', previousTag);
  write('apps/cli/src/command.ts', 'export const behaviour = "final";\n');
  write('packages/sdk/src/client.ts', 'export const resource = "final";\n');
  write('apps/cli/package.json', JSON.stringify({ version: '0.2.0' }));
  write('packages/sdk/package.json', JSON.stringify({ version: '0.3.0' }));
  write('scripts/internal-tool.mjs', '// not a component change\n');
  const baseSha = commit('feat(cli,sdk): add final behaviour');
  git('tag', `${component === 'cli' ? 'sdk' : 'cli'}-v9.0.0`);
  git('tag', `${component}-v${version}-rc.1`);
  const heading = `## [${version}](https://example.invalid/compare) (2026-10-28)`;
  const generatedEntry = `${heading}\n\n### Features\n\n- introduce obsolete behaviour\n`;
  const olderEntry = `## ${previousVersion}\n\n- Initial release\n`;
  const marker = { component, version, candidate: baseSha, previous_tag: previousTag };
  const entry = `${heading}\n\nFinal user-visible behaviour.\n\n### Features\n\n- Use the final behaviour.\n${provenance ? `\n<!-- vaia-release-notes ${JSON.stringify(marker)} -->\n` : ''}`;
  const changelog = `${component === 'cli' ? 'apps/cli' : 'packages/sdk'}/CHANGELOG.md`;
  write(changelog, `# Changelog\n\n${entry}\n${olderEntry}`);
  const headSha = commit(`docs(release): summarize ${component} ${version} changes`);
  const body = `:robot: I have created a release *beep* *boop*\n---\n\n${generatedEntry}\n---\nThis PR was generated with [Release Please](https://github.com/googleapis/release-please).`;
  const pr = {
    number: 42, state: 'open', merged: false, labels: [{ name: 'autorelease: pending' }], body,
    base: { ref: 'main', sha: previousSha, repo: { full_name: repository } },
    head: { ref: `release/${component}-v${version}`, sha: headSha, repo: { full_name: repository } },
  };
  return { cwd, git, write, commit, pr, previousSha, baseSha, headSha, entry, olderEntry, marker, changelog };
}

function transport(pr, onFinalRead) {
  const calls = [];
  const current = structuredClone(pr);
  let reads = 0;
  return {
    calls, current,
    request: async (method, path, payload) => {
      calls.push({ method, path, payload });
      if (method === 'GET' && path === 'pulls/42') {
        reads += 1;
        if (reads === 2) onFinalRead?.(current);
        return structuredClone(current);
      }
      if (method === 'PATCH' && path === 'pulls/42') {
        assert.deepEqual(Object.keys(payload), ['body']);
        current.body = payload.body;
        return {};
      }
      assert.fail(`Unexpected operation: ${method} ${path}`);
    },
  };
}

test('authorizes only the pinned maintainer identity and checks the rerun actor', async () => {
  assert.equal(releaseNotesOwner.id, '20087388');
  assert.doesNotThrow(() => authorizeReleaseNotes(ownerEnv));
  const rejected = [
    { GITHUB_ACTOR: 'another-user', GITHUB_ACTOR_ID: '123', GITHUB_TRIGGERING_ACTOR: 'another-user' },
    { GITHUB_ACTOR_ID: '123' },
    { GITHUB_ACTOR: 'another-user' },
    { GITHUB_TRIGGERING_ACTOR: 'another-user' },
    { GITHUB_TRIGGERING_ACTOR: undefined },
    { GITHUB_ACTOR: 'another-user', GITHUB_ACTOR_ID: '123', GITHUB_TRIGGERING_ACTOR: 'imsergiobernal' },
    { GITHUB_REPOSITORY: 'someone/vaia' },
    { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_EVENT_NAME: 'issue_comment' },
    { GITHUB_EVENT_NAME: 'pull_request' },
  ];
  for (const change of rejected) {
    let requested = false;
    await assert.rejects(syncReleaseNotes(42, {
      env: { ...ownerEnv, ...change },
      request: async () => { requested = true; assert.fail('Unauthorized runs must not access GitHub'); },
    }), /Only imsergiobernal/);
    assert.equal(requested, false);
  }
});

test('uses its own previous stable component tag, ignoring prereleases and other component tags', (t) => {
  const f = fixture(t);
  const context = releaseNotesContext(f.pr, f);
  assert.equal(context.previousTag, 'cli-v0.1.0');
  assert.equal(context.baseSha, f.previousSha);
  assert.equal(context.candidateSha, f.baseSha);
  assert.equal(context.headSha, f.headSha);
  assert.equal(context.changelog, 'apps/cli/CHANGELOG.md');
  assert.doesNotThrow(() => validateDraftProvenance(f.entry, context));
});

test('supports first releases and SDK hotfixes independently', (t) => {
  const f = fixture(t, { component: 'sdk', firstRelease: true });
  f.pr.head.ref = 'hotfix/sdk-v0.3.0';
  const context = releaseNotesContext(f.pr, f);
  assert.equal(context.previousTag, null);
  assert.equal(context.changelog, 'packages/sdk/CHANGELOG.md');
  assert.doesNotThrow(() => validateDraftProvenance(f.entry, context));
});

test('rejects forks, closed PRs, ordinary PRs and unsupported release branches', (t) => {
  const f = fixture(t);
  for (const mutate of [
    (pr) => { pr.head.repo.full_name = 'someone/vaia'; },
    (pr) => { pr.base.repo.full_name = 'someone/vaia'; },
    (pr) => { pr.state = 'closed'; pr.merged = true; },
    (pr) => { pr.head.ref = 'feature/something'; },
    (pr) => { pr.base.ref = 'develop'; },
    (pr) => { pr.head.ref = 'release/cli-v0.3.0'; },
  ]) {
    const pr = structuredClone(f.pr);
    mutate(pr);
    assert.throws(() => releaseNotesContext(pr, f));
  }
});

test('refuses source changes after the notes candidate', (t) => {
  const f = fixture(t);
  f.write('apps/cli/src/command.ts', 'export const behaviour = "hidden change";\n');
  f.pr.head.sha = f.commit('fix(cli): change source in preparation');
  assert.throws(() => releaseNotesContext(f.pr, f), /candidate changed/);
});

test('refuses version and dependency changes after the notes candidate', (t) => {
  const f = fixture(t);
  f.write('apps/cli/package.json', JSON.stringify({ version: '0.2.0', dependencies: { unexpected: '1.0.0' } }));
  f.pr.head.sha = f.commit('deps(cli): change dependencies in preparation');
  assert.throws(() => releaseNotesContext(f.pr, f), /candidate changed/);
});

test('rejects missing, duplicate, malformed, stale and cross-component provenance', (t) => {
  const f = fixture(t);
  const context = releaseNotesContext(f.pr, f);
  const replaceMarker = (value) => f.entry.replace(JSON.stringify(f.marker), JSON.stringify(value));
  const entries = [
    f.entry.replace(/^<!-- vaia-release-notes .* -->\n/gm, ''),
    `${f.entry}\n<!-- vaia-release-notes ${JSON.stringify(f.marker)} -->\n`,
    f.entry.replace(JSON.stringify(f.marker), '{invalid}'),
    replaceMarker({ ...f.marker, candidate: f.previousSha }),
    replaceMarker({ ...f.marker, component: 'sdk' }),
    replaceMarker({ ...f.marker, previous_tag: 'cli-v0.0.1' }),
    replaceMarker({ ...f.marker, version: '0.3.0' }),
    replaceMarker({ ...f.marker, approved: true }),
    `## 0.2.0\n\n<!-- vaia-release-notes ${JSON.stringify(f.marker)} -->\n`,
  ];
  for (const entry of entries) assert.throws(() => validateDraftProvenance(entry, context));
});

test('copies exactly the committed release entry into the PR body without writing repository files', async (t) => {
  const f = fixture(t);
  const before = f.git('rev-parse', 'HEAD');
  const api = transport(f.pr);
  const result = await syncReleaseNotes(42, { ...f, env: ownerEnv, request: api.request });
  assert.equal(result.entry, f.entry);
  assert.equal(result.changed, true);
  assert.ok(api.current.body.includes(f.entry.trim()));
  assert.match(api.current.body, /synchronized by imsergiobernal/);
  assert.match(api.current.body, /obsolete/); // Existing PR text is preserved.
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(extractReleaseNotes(f.git('show', `${before}:${f.changelog}`), '0.1.0'), f.olderEntry);
  assert.equal(api.calls.filter((call) => call.method !== 'GET').length, 1);
  assert(api.calls.every((call) => call.path === 'pulls/42'));
});

test('is idempotent and preserves existing PR content', async (t) => {
  const f = fixture(t);
  const api = transport(f.pr);
  await syncReleaseNotes(42, { ...f, env: ownerEnv, request: api.request });
  const previousBody = api.current.body;
  const result = await syncReleaseNotes(42, { ...f, env: ownerEnv, request: api.request });
  assert.equal(result.changed, false);
  assert.equal(api.current.body, previousBody);
  assert.equal(api.calls.filter((call) => call.method === 'PATCH').length, 1);
  assert(api.current.body.startsWith(':robot: I have created a release *beep* *boop*'));
  assert.match(api.current.body, /This PR was generated with \[Release Please\]/);
});

test('rejects source candidates, head commits or body edits changed during synchronization', async (t) => {
  const f = fixture(t);
  for (const mutate of [
    (pr) => { pr.base.sha = f.headSha; },
    (pr) => { pr.head.sha = f.baseSha; },
    (pr) => { pr.body += '\nHuman edit'; },
  ]) {
    const api = transport(f.pr, mutate);
    await assert.rejects(syncReleaseNotes(42, { ...f, env: ownerEnv, request: api.request }), /changed during synchronization/);
    assert(api.calls.every((call) => call.method === 'GET'));
  }
});

test('refuses automatic notes that have not been drafted for the current candidate', async (t) => {
  const f = fixture(t, { provenance: false });
  const api = transport(f.pr);
  await assert.rejects(syncReleaseNotes(42, { ...f, env: ownerEnv, request: api.request }), /provenance marker/);
  assert(api.calls.every((call) => call.method === 'GET'));
});

test('does not leak credentials or response bodies on GitHub failure', async () => {
  const request = githubClient(repository, 'private-token', async () => ({ ok: false, status: 403 }));
  await assert.rejects(request('GET', 'pulls/42'), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /private-token/);
    return true;
  });
});
