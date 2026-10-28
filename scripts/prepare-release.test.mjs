import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { prepareRelease } from './prepare-release.mts';
import { extractReleaseNotes } from './release-notes.mts';
import { releaseNotesContext, renderPullRequestBody } from './sync-release-notes.mts';
import { validateReleaseTag } from './validate-release.mts';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'vaia-release-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const file = (path, value) => {
    const target = join(cwd, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  const commit = (message) => { git('add', '.'); git('commit', '-m', message); };
  git('init', '-b', 'main');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release@example.invalid');
  file('apps/cli/package.json', JSON.stringify({ version: '1.0.0' }));
  file('packages/sdk/package.json', JSON.stringify({ version: '1.0.0' }));
  commit('chore: initialize');
  return { cwd, git, file, commit };
}

function notes(cwd, path) { return readFileSync(join(cwd, path), 'utf8'); }

test('generates CLI notes locally from the first release and preserves existing edits', (t) => {
  const { cwd, git, file, commit } = fixture(t);
  git('checkout', '-b', 'release/cli-v1.0.0');
  file('apps/cli/src/index.ts', 'first');
  commit('feat(cli): add command');
  file('packages/sdk/src/index.ts', 'unrelated');
  commit('fix(sdk): fix SDK only');
  file('apps/cli/package.json', JSON.stringify({ version: '1.0.0', dependencies: { sdk: '1.0.0' } }));
  commit('deps(cli): update SDK dependency');
  file('apps/cli/src/index.ts', 'second');
  commit('refactor(cli)!: change command');
  const result = prepareRelease('release/cli-v1.0.0', { cwd });
  assert.equal(result.changed, true);
  const content = notes(cwd, result.changelog);
  assert.match(content, /### Features\n\n\* add command/);
  assert.match(content, /### Dependencies\n\n\* update SDK dependency/);
  assert.match(content, /### Breaking Changes\n\n\* change command/);
  assert.doesNotMatch(content, /fix SDK only/);
  assert.match(extractReleaseNotes(content, '1.0.0'), /add command/);
  file(result.changelog, content.replace('add command', 'manual notes'));
  assert.equal(prepareRelease('release/cli-v1.0.0', { cwd }).changed, false);
  assert.match(notes(cwd, result.changelog), /manual notes/);
});

test('uses the nearest reachable component tag and includes OpenAPI changes for SDK', (t) => {
  const { cwd, git, file, commit } = fixture(t);
  file('packages/sdk/old.ts', 'old');
  commit('feat(sdk): old feature');
  git('tag', 'sdk-v0.8.0');
  file('packages/sdk/older.ts', 'older');
  commit('fix(sdk): previous fix');
  git('tag', 'sdk-v0.9.0');
  git('tag', 'cli-v0.9.0');
  git('checkout', '-b', 'hotfix/sdk-v1.0.0');
  file('packages/openapi/openapi.yaml', 'change');
  commit('fix(openapi): update contract');
  file('packages/sdk/new.ts', 'new');
  commit('chore(sdk): update API\n\nBREAKING CHANGE: incompatible API');
  const result = prepareRelease('hotfix/sdk-v1.0.0', { cwd });
  const content = notes(cwd, result.changelog);
  assert.match(content, /update contract/);
  assert.match(content, /### Breaking Changes\n\n\* update API/);
  assert.doesNotMatch(content, /old feature|previous fix/);
});

test('does not create an entry when no releasable changes exist', (t) => {
  const { cwd, git } = fixture(t);
  git('checkout', '-b', 'release/cli-v1.0.0');
  assert.equal(prepareRelease('release/cli-v1.0.0', { cwd }).changed, false);
  assert.throws(() => readFileSync(join(cwd, 'apps/cli/CHANGELOG.md')));
  assert.throws(() => prepareRelease('release/sdk-v1.0.0', { cwd }), /Check out/);
});

test('generated notes work with tag validation and reviewed-note synchronization', (t) => {
  const { cwd, git, file, commit } = fixture(t);
  const base = git('rev-parse', 'HEAD');
  git('tag', 'cli-v0.9.0');
  git('checkout', '-b', 'release/cli-v1.0.0');
  file('apps/cli/index.ts', 'feature');
  commit('feat(cli): add command');
  const result = prepareRelease('release/cli-v1.0.0', { cwd });
  commit('docs(release): prepare notes');
  const candidate = git('rev-parse', 'HEAD');
  file(result.changelog, notes(cwd, result.changelog) + `\n<!-- vaia-release-notes {"component":"cli","version":"1.0.0","candidate":"${candidate}","previous_tag":"cli-v0.9.0"} -->\n`);
  commit('docs(release): review notes');
  const head = git('rev-parse', 'HEAD');
  const ref = (name, sha) => ({ ref: name, sha, repo: { full_name: 'imsergiobernal/vaia' } });
  const pr = { number: 1, state: 'open', merged: false, body: 'Review', base: ref('main', base), head: ref('release/cli-v1.0.0', head) };
  const context = releaseNotesContext(pr, { cwd });
  assert.equal(context.candidateSha, candidate);
  assert.equal(context.previousTag, 'cli-v0.9.0');
  assert.match(renderPullRequestBody(pr.body, context, extractReleaseNotes(notes(cwd, result.changelog), '1.0.0')), /add command/);
  git('tag', 'cli-v1.0.0');
  git('update-ref', 'refs/remotes/origin/main', head);
  assert.match(validateReleaseTag('cli-v1.0.0', 'cli', { cwd }).notes, /add command/);
});
