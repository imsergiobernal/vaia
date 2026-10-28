import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import releasePlease from 'release-please';
import { prepareRelease } from './prepare-release.mjs';
import { validateReleaseTag } from './validate-release.mjs';

releasePlease.setLogger(new Proxy({}, { get: () => () => {} }));

// Exercise installed Release Please strategies with an in-memory GitHub transport.
class MemoryGitHub {
  repository = { owner: 'example', repo: 'vaia', defaultBranch: 'main' };
  files = new Map([
    ['apps/cli/package.json', JSON.stringify({ name: '@imsergiobernal/vaia-cli', version: '0.2.0' })],
    ['packages/sdk/package.json', JSON.stringify({ name: '@imsergiobernal/vaia-sdk', version: '0.3.0' })],
  ]);
  commits = [
    { sha: '4'.repeat(40), message: 'feat(cli)!: new command interface', files: ['apps/cli/src/commands/new.ts'] },
    { sha: '3'.repeat(40), message: 'feat(sdk): new SDK resource', files: ['packages/sdk/src/client.ts'] },
    { sha: '2'.repeat(40), message: 'feat(cli): initial CLI feature', files: ['apps/cli/src/bin/run.ts'] },
    { sha: '1'.repeat(40), message: 'feat(sdk): initial SDK feature', files: ['packages/sdk/src/index.ts'] },
  ];
  tags = [];
  releases = [];
  prs = [];
  changes = new Map();
  created = 0;
  updated = 0;

  async *mergeCommitIterator(_branch, { maxResults = Infinity } = {}) { yield* this.commits.slice(0, maxResults); }
  async *releaseIterator() { yield* this.releases; }
  async *tagIterator() { yield* this.tags; }
  async *pullRequestIterator(branch, state) {
    yield* this.prs.filter((pr) => pr.baseBranchName === branch && pr.state === state);
  }
  async getFileContentsOnBranch(path) {
    if (!this.files.has(path)) throw new Error(`Unexpected file read: ${path}`);
    const parsedContent = this.files.get(path);
    return { parsedContent, content: Buffer.from(parsedContent).toString('base64'), sha: 'file-sha' };
  }
  async buildChangeSet(updates) {
    const changes = new Map();
    for (const update of updates) {
      const originalContent = this.files.get(update.path);
      if (originalContent === undefined && !update.createIfMissing) continue;
      changes.set(update.path, { mode: '100644', originalContent: originalContent ?? null, content: update.updater.updateContent(originalContent) });
    }
    this.changes = changes;
    return changes;
  }
  async createPullRequest(pr, branch, _message, updates) {
    this.created += 1;
    this.changes = await this.buildChangeSet(updates);
    const created = { ...pr, number: this.created, state: 'OPEN', baseBranchName: branch };
    this.prs.push(created);
    return created;
  }
  async updatePullRequest(number, pr, branch) {
    this.updated += 1;
    this.changes = await this.buildChangeSet(pr.updates);
    const existing = this.prs.find((candidate) => candidate.number === number);
    Object.assign(existing, { title: pr.title.toString(), body: pr.body.toString(), baseBranchName: branch });
    return existing;
  }
  async createRelease() { assert.fail('Preparation must never create a GitHub Release'); }
  async createTag() { assert.fail('Preparation must never create a Git tag'); }
  async createFileOnNewBranch() { assert.fail('Preparation must only create/update its release PR'); }
}

function fixture(t, github = new MemoryGitHub()) {
  const cwd = mkdtempSync(join(tmpdir(), 'vaia-prepare-release-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const [path, contents] of github.files) {
    const directory = path.slice(0, path.lastIndexOf('/'));
    mkdirSync(join(cwd, directory), { recursive: true });
    writeFileSync(join(cwd, path), contents);
  }
  const messages = [];
  return {
    github,
    messages,
    options: {
      cwd,
      env: { GITHUB_REPOSITORY: 'example/vaia', RELEASE_PLEASE_TOKEN: 'test-installation-token' },
      createGitHub: async () => github,
      log: (message) => messages.push(message),
    },
  };
}

test('prepares only CLI at the version fixed by the branch, even for breaking commits', async (t) => {
  const { github, options } = fixture(t);
  const result = await prepareRelease('release/cli-v0.2.0', options);
  assert.equal(result.changed, true);
  assert.equal(github.prs.length, 0);
  assert.equal(JSON.parse(readFileSync(join(options.cwd, 'apps/cli/package.json'), 'utf8')).version, '0.2.0');
  const notes = github.changes.get('apps/cli/CHANGELOG.md').content;
  assert.match(notes, /new command interface/);
  assert.match(notes, /initial CLI feature/);
  assert.doesNotMatch(notes, /SDK resource|SDK feature/);
  assert.ok([...github.changes.keys()].every((path) => path.startsWith('apps/cli/')));
  assert.equal(github.tags.length, 0);
  assert.equal(github.releases.length, 0);
});

test('prepares an SDK hotfix independently, including its first-release history', async (t) => {
  const { github, options } = fixture(t);
  await prepareRelease('hotfix/sdk-v0.3.0', options);
  assert.equal(github.prs.length, 0);
  assert.equal(JSON.parse(readFileSync(join(options.cwd, 'packages/sdk/package.json'), 'utf8')).version, '0.3.0');
  const notes = github.changes.get('packages/sdk/CHANGELOG.md').content;
  assert.match(notes, /new SDK resource/);
  assert.match(notes, /initial SDK feature/);
  assert.doesNotMatch(notes, /CLI feature|command interface/);
  assert.ok([...github.changes.keys()].every((path) => path.startsWith('packages/sdk/')));
});

test('publishers accept the real generated changelog at an integrated tag for each component', async (t) => {
  for (const [component, version] of [['cli', '0.2.0'], ['sdk', '0.3.0']]) {
    const { github, options } = fixture(t);
    const tag = `${component}-v${version}`;
    const { release } = await prepareRelease(`release/${tag}`, options);
    for (const [path, change] of github.changes) writeFileSync(join(options.cwd, path), change.content);
    const git = (...args) => execFileSync('git', args, { cwd: options.cwd, stdio: 'pipe' });
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Preparation test');
    git('config', 'user.email', 'preparation-test@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'tag.gpgsign', 'false');
    git('config', 'core.autocrlf', 'false');
    git('add', '.');
    git('commit', '-m', `Prepare ${tag}`);
    git('tag', tag);
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    const validated = validateReleaseTag(tag, component, { cwd: options.cwd });
    assert.match(validated.notes, new RegExp(version.replaceAll('.', '\\.')));
    assert.ok(validated.notes.includes(component === 'cli' ? 'new command interface' : 'new SDK resource'));
    assert.equal(validated.manifest, release.manifest);
  }
});

test('starts history at the previous tag of the selected component, ignoring newer SDK releases', async (t) => {
  const { github, options } = fixture(t);
  github.tags = [{ name: 'sdk-v9.0.0', sha: '3'.repeat(40) }, { name: 'cli-v0.1.0', sha: '2'.repeat(40) }];
  github.releases = [{ tagName: 'sdk-v9.0.0', sha: '3'.repeat(40) }];
  await prepareRelease('release/cli-v0.2.0', options);
  const notes = github.changes.get('apps/cli/CHANGELOG.md').content;
  assert.match(notes, /new command interface/);
  assert.doesNotMatch(notes, /initial CLI feature|SDK/);
  assert.match(notes, /cli-v0\.1\.0\.\.\.cli-v0\.2\.0/);
});

test('keeps existing notes on repeated runs and never creates a separate PR', async (t) => {
  const { github, options, messages } = fixture(t);
  await prepareRelease('release/cli-v0.2.0', options);
  github.commits.unshift({ sha: '5'.repeat(40), message: 'fix(cli): fix stabilization bug', files: ['apps/cli/src/fix.ts'] });
  await prepareRelease('release/cli-v0.2.0', options);
  assert.equal(github.created, 0);
  assert.equal(github.updated, 0);
  assert.doesNotMatch(readFileSync(join(options.cwd, 'apps/cli/CHANGELOG.md'), 'utf8'), /fix stabilization bug/);
  assert.match(messages.at(-1), /Existing.*notes retained/);
});

test('reports no notes when there are no releasable component changes', async (t) => {
  const { github, options, messages } = fixture(t);
  github.commits = [{ sha: '1'.repeat(40), message: 'chore(cli): prepare version', files: ['apps/cli/package.json'] }];
  const result = await prepareRelease('release/cli-v0.2.0', options);
  assert.equal(result.changed, false);
  assert.equal(github.created, 0);
  assert.match(messages[0], /no releasable changes/i);
});

test('does not overwrite a changelog that differs from the release branch', async (t) => {
  const { options } = fixture(t);
  const path = join(options.cwd, 'apps/cli/CHANGELOG.md');
  const local = '# Changelog\n\n## 0.1.0\n\n- Existing notes.\n';
  writeFileSync(path, local);
  await assert.rejects(prepareRelease('release/cli-v0.2.0', options), /remote changelog differs/);
  assert.equal(readFileSync(path, 'utf8'), local);
});

test('rejects duplicate target entries rather than overwriting authored notes', async (t) => {
  const { options } = fixture(t);
  const path = join(options.cwd, 'apps/cli/CHANGELOG.md');
  const local = '# Changelog\n\n## 0.2.0\n\n- One.\n\n## 0.2.0\n\n- Two.\n';
  writeFileSync(path, local);
  await assert.rejects(prepareRelease('release/cli-v0.2.0', options), /found 2/);
  assert.equal(readFileSync(path, 'utf8'), local);
});

test('considers the full available history for the first release instead of stopping at 500 commits', async (t) => {
  const { github, options } = fixture(t);
  github.commits = [
    ...Array.from({ length: 501 }, (_, index) => ({ sha: String(index + 2).padStart(40, '0'), message: 'chore(cli): maintain tooling', files: ['apps/cli/package.json'] })),
    { sha: '1'.repeat(40), message: 'feat(cli): original feature before the default history limit', files: ['apps/cli/src/bin/run.ts'] },
  ];
  await prepareRelease('release/cli-v0.2.0', options);
  assert.match(github.changes.get('apps/cli/CHANGELOG.md').content, /original feature before the default history limit/);
});

test('rejects invalid branches and mismatched versions before contacting GitHub', async (t) => {
  const { options } = fixture(t);
  options.createGitHub = async () => assert.fail('Must not authenticate an invalid release');
  await assert.rejects(prepareRelease('release/api-v0.2.0', options), /Invalid release reference/);
  await assert.rejects(prepareRelease('release/cli-v0.2.0-rc.1', options), /Invalid release reference/);
  await assert.rejects(prepareRelease('release/cli-v0.3.0', options), /found 0.2.0/);
});

test('requires explicit repository and App token configuration without falling back to GITHUB_TOKEN', async (t) => {
  const { options } = fixture(t);
  options.createGitHub = async () => assert.fail('Must not authenticate without configuration');
  await assert.rejects(prepareRelease('release/cli-v0.2.0', { ...options, env: {} }), /Set GITHUB_REPOSITORY/);
  await assert.rejects(prepareRelease('release/cli-v0.2.0', { ...options, env: { GITHUB_REPOSITORY: 'example/vaia', GITHUB_TOKEN: 'not-an-app-token' } }), /Set RELEASE_PLEASE_TOKEN/);
});

test('explains rejected App authentication without exposing its token', async (t) => {
  const { options } = fixture(t);
  for (const status of [401, 403]) {
    options.createGitHub = async () => { throw Object.assign(new Error('rejected test-installation-token'), { status }); };
    await assert.rejects(prepareRelease('release/cli-v0.2.0', options), (error) => {
      assert.match(error.message, /App installation and permissions/);
      assert.doesNotMatch(error.message, /test-installation-token/);
      return true;
    });
  }
});
