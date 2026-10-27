import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readReleaseNotes } from './release-notes.mjs';

const manifests = {
  cli: 'apps/cli/package.json',
  sdk: 'packages/sdk/package.json',
};
const tagPattern = /^(cli|sdk)-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;

export function parseReleaseRef(ref, kind) {
  let tag = ref;
  if (kind === 'branch') {
    const branch = /^(release|hotfix)\/(.+)$/.exec(ref);
    if (!branch) {
      throw new Error('Expected release/<component>-vX.Y.Z or hotfix/<component>-vX.Y.Z.');
    }
    tag = branch[2];
  } else if (kind !== 'tag') {
    throw new Error('Expected a branch or tag reference.');
  }

  const match = tagPattern.exec(tag);
  if (!match) {
    throw new Error(`Invalid release reference: ${ref}. Use cli or sdk and a stable X.Y.Z version.`);
  }
  const [, component, version] = match;
  return { component, version, tag, manifest: manifests[component] };
}

function validateVersion(release, cwd) {
  const { version } = JSON.parse(readFileSync(resolve(cwd, release.manifest), 'utf8'));
  if (release.version !== version) {
    throw new Error(`${release.tag} requires ${release.manifest} version ${release.version}; found ${version}.`);
  }
  return release;
}

export function validateReleaseBranch(branch, { cwd = process.cwd() } = {}) {
  return validateVersion(parseReleaseRef(branch, 'branch'), cwd);
}

export function validateReleaseTag(tag, component, { cwd = process.cwd() } = {}) {
  const release = parseReleaseRef(tag, 'tag');
  if (release.component !== component) {
    throw new Error(`The ${component} workflow cannot publish ${release.component}.`);
  }
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = git('rev-parse', '--verify', `refs/tags/${release.tag}^{commit}`);
  if (commit !== git('rev-parse', 'HEAD')) {
    throw new Error(`Check out ${release.tag} before validating its package version.`);
  }
  const result = spawnSync('git', ['merge-base', '--is-ancestor', commit, 'refs/remotes/origin/main'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${release.tag} must be integrated into origin/main. Fetch the complete history and push main before its tag.`);
  }
  validateVersion(release, cwd);
  return { ...release, notes: readReleaseNotes(release, { cwd }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [kind, first, second, ...extra] = process.argv.slice(2);
    let release;
    if (kind === 'branch' && first && second === undefined) {
      release = validateReleaseBranch(first);
    } else if (kind === 'tag' && Object.hasOwn(manifests, first) && second &&
      (extra.length === 0 || (extra.length === 2 && extra[0] === '--notes-file'))) {
      release = validateReleaseTag(second, first);
      if (extra.length) writeFileSync(resolve(extra[1]), release.notes);
    } else {
      throw new Error('Usage: node scripts/validate-release.mjs branch <branch> | tag <cli|sdk> <tag> [--notes-file <path>]');
    }
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `component=${release.component}\nversion=${release.version}\ntag=${release.tag}\n`);
    }
    console.log(`Validated ${release.tag} against ${release.manifest}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
