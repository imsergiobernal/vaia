import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseReleaseRef, validateReleaseBranch, validateReleaseTag } from './validate-release.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'vaia-release-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=develop');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  for (const [path, version] of [['apps/cli', '0.2.0'], ['packages/sdk', '0.3.0']]) {
    mkdirSync(join(cwd, path), { recursive: true });
    writeFileSync(join(cwd, path, 'package.json'), JSON.stringify({ version }));
    writeFileSync(join(cwd, path, 'CHANGELOG.md'), `# Changelog\n\n## ${version}\n\n### Features\n\n* Prepared ${path}.\n`);
  }
  git('add', '.');
  git('commit', '-m', 'Initial packages');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { cwd, git };
}

test('release and hotfix branches select one component without coupling versions', (t) => {
  const { cwd } = fixture(t);
  for (const kind of ['release', 'hotfix']) {
    assert.equal(validateReleaseBranch(`${kind}/cli-v0.2.0`, { cwd }).component, 'cli');
    assert.equal(validateReleaseBranch(`${kind}/sdk-v0.3.0`, { cwd }).component, 'sdk');
  }
  assert.throws(() => validateReleaseBranch('release/cli-v0.3.0', { cwd }), /found 0.2.0/);
  assert.throws(() => validateReleaseBranch('hotfix/sdk-v0.2.0', { cwd }), /found 0.3.0/);
});

test('rejects unsupported components, dates, nested names, suffixes and non-SemVer numbers', () => {
  for (const tag of ['api-v1.0.0', 'v1.0.0', 'cli-v1.0', 'sdk-v2026-10-27', 'cli/v1.0.0',
    'cli-v1.0.0-rc.1', 'sdk-v1.0.0+build.1', 'cli-v01.0.0', 'sdk-v1.01.0', 'cli-v1.0.01',
    'CLI-v1.0.0', 'cli-v1.0.0\n', 'cli-v1.0.0/extra', '--help']) {
    assert.throws(() => parseReleaseRef(tag, 'tag'), undefined, tag);
    assert.throws(() => parseReleaseRef(`release/${tag}`, 'branch'), undefined, tag);
  }
  for (const branch of ['feature/cli-v1.0.0', 'release/', 'release', 'release/release/cli-v1.0.0']) {
    assert.throws(() => parseReleaseRef(branch, 'branch'), undefined, branch);
  }
  assert.equal(parseReleaseRef('sdk-v0.0.0', 'tag').version, '0.0.0');
});

test('accepts lightweight and annotated tags integrated into main, including older releases', (t) => {
  const { cwd, git } = fixture(t);
  git('tag', 'cli-v0.2.0');
  git('tag', '-a', 'sdk-v0.3.0', '-m', 'SDK release');
  git('commit', '--allow-empty', '-m', 'Later main change');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '--detach', 'cli-v0.2.0');
  assert.equal(validateReleaseTag('cli-v0.2.0', 'cli', { cwd }).version, '0.2.0');
  assert.equal(validateReleaseTag('sdk-v0.3.0', 'sdk', { cwd }).version, '0.3.0');
});

test('rejects a tag outside main even when its package version matches', (t) => {
  const { cwd, git } = fixture(t);
  git('commit', '--allow-empty', '-m', 'Unmerged release');
  git('tag', 'cli-v0.2.0');
  assert.throws(() => validateReleaseTag('cli-v0.2.0', 'cli', { cwd }), /integrated into origin\/main/);
});

test('fails closed when main history or the requested tag is unavailable', (t) => {
  const { cwd, git } = fixture(t);
  assert.throws(() => validateReleaseTag('cli-v0.2.0', 'cli', { cwd }));
  git('tag', 'cli-v0.2.0');
  git('update-ref', '-d', 'refs/remotes/origin/main');
  assert.throws(() => validateReleaseTag('cli-v0.2.0', 'cli', { cwd }), /complete history/);
});

test('rejects cross-component publication, mismatched versions and a checkout different from the tag', (t) => {
  const { cwd, git } = fixture(t);
  git('tag', 'cli-v0.2.0');
  git('tag', 'sdk-v0.4.0');
  assert.throws(() => validateReleaseTag('cli-v0.2.0', 'sdk', { cwd }), /cannot publish cli/);
  assert.throws(() => validateReleaseTag('sdk-v0.4.0', 'sdk', { cwd }), /found 0.3.0/);
  git('commit', '--allow-empty', '-m', 'Different checkout');
  assert.throws(() => validateReleaseTag('cli-v0.2.0', 'cli', { cwd }), /Check out cli-v0.2.0/);
});

test('the command fails before writing GitHub outputs for an invalid branch', (t) => {
  const { cwd } = fixture(t);
  const output = join(cwd, 'github-output');
  writeFileSync(output, '');
  const command = fileURLToPath(new URL('./validate-release.mjs', import.meta.url));
  const env = { ...process.env, GITHUB_OUTPUT: output };
  assert.throws(() => execFileSync(process.execPath, [command, 'branch', 'release/cli-v9.0.0'], { cwd, env, stdio: 'pipe' }));
  assert.equal(readFileSync(output, 'utf8'), '');
  execFileSync(process.execPath, [command, 'branch', 'release/cli-v0.2.0'], { cwd, env, stdio: 'pipe' });
  assert.match(readFileSync(output, 'utf8'), /component=cli\nversion=0.2.0\ntag=cli-v0.2.0\n/);
});

test('publication requires notes for the tagged version and exports those exact notes', (t) => {
  const { cwd, git } = fixture(t);
  git('tag', 'cli-v0.2.0');
  const command = fileURLToPath(new URL('./validate-release.mjs', import.meta.url));
  const notesFile = join(cwd, 'release-notes.md');
  execFileSync(process.execPath, [command, 'tag', 'cli', 'cli-v0.2.0', '--notes-file', notesFile], { cwd, stdio: 'pipe' });
  assert.equal(readFileSync(notesFile, 'utf8'), '## 0.2.0\n\n### Features\n\n* Prepared apps/cli.\n');

  writeFileSync(join(cwd, 'apps/cli/CHANGELOG.md'), '# Changelog\n\n## 0.1.0\n\n* An older release.\n');
  assert.throws(() => validateReleaseTag('cli-v0.2.0', 'cli', { cwd }), /entry for 0.2.0/);
  rmSync(join(cwd, 'apps/cli/CHANGELOG.md'));
  assert.throws(() => validateReleaseTag('cli-v0.2.0', 'cli', { cwd }), /Missing apps\/cli\/CHANGELOG.md/);
});
