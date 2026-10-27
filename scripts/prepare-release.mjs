import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import releasePlease from 'release-please';
import { validateReleaseBranch } from './validate-release.mjs';

const { GitHub, Manifest } = releasePlease;

export async function prepareRelease(branch, {
  cwd = process.cwd(),
  env = process.env,
  createGitHub = (options) => GitHub.create(options),
  log = console.log,
} = {}) {
  // Invalid refs and mismatched local versions must fail before contacting GitHub.
  const release = validateReleaseBranch(branch, { cwd });
  const repository = /^([^/\s]+)\/([^/\s]+)$/.exec(env.GITHUB_REPOSITORY ?? '');
  if (!repository) {
    throw new Error('Set GITHUB_REPOSITORY to the owner/repository to prepare.');
  }
  if (!env.RELEASE_PLEASE_TOKEN?.trim()) {
    throw new Error('Set RELEASE_PLEASE_TOKEN to a GitHub App installation token. No fallback token is used.');
  }

  const [, owner, repo] = repository;
  try {
    const github = await createGitHub({ owner, repo, token: env.RELEASE_PLEASE_TOKEN, defaultBranch: branch });
    const manifest = await Manifest.fromConfig(github, branch, {
      releaseType: 'node',
      component: release.component,
      releaseAs: release.version,
      includeComponentInTag: true,
      includeVInTag: true,
      tagSeparator: '-',
      skipGithubRelease: true,
    }, {
      separatePullRequests: true,
      alwaysUpdate: true,
      commitSearchDepth: Number.MAX_SAFE_INTEGER,
    }, dirname(release.manifest).replaceAll('\\', '/'));

    // Deliberately use only the PR operation. Gitflow owns tags and the
    // tag-triggered publishers own GitHub Releases and package publication.
    const pullRequests = (await manifest.createPullRequests()).filter(Boolean);
    if (pullRequests.length === 0) {
      log(`No PR created for ${branch}: no releasable changes, or preparation is already merged. Gitflow remains responsible for finishing the release.`);
    } else {
      for (const pr of pullRequests) {
        log(`Prepared ${release.tag}: https://github.com/${owner}/${repo}/pull/${pr.number} -> ${branch}`);
      }
    }
    return { release, pullRequests };
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      throw new Error('Release Please authentication failed. Check that the GitHub App is installed on this repository and has Contents, Pull requests and Issues write permissions.', { cause: error });
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: pnpm release:prepare <release|hotfix>/<cli|sdk>-vX.Y.Z\nRequires GITHUB_REPOSITORY and RELEASE_PLEASE_TOKEN (GitHub App installation token).');
  } else {
    try {
      if (args.length !== 1) throw new Error('Usage: pnpm release:prepare <release|hotfix>/<cli|sdk>-vX.Y.Z');
      await prepareRelease(args[0]);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
