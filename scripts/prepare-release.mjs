import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import releasePlease from 'release-please';
import { validateReleaseBranch } from './validate-release.mjs';
import { extractReleaseNotes } from './release-notes.mjs';

const { GitHub, Manifest } = releasePlease;

export async function prepareRelease(branch, {
  cwd = process.cwd(), env = process.env,
  createGitHub = (options) => GitHub.create(options), log = console.log,
} = {}) {
  const release = validateReleaseBranch(branch, { cwd });
  const repository = /^([^/\s]+)\/([^/\s]+)$/.exec(env.GITHUB_REPOSITORY ?? '');
  if (!repository) throw new Error('Set GITHUB_REPOSITORY to the owner/repository to prepare.');
  if (!env.RELEASE_PLEASE_TOKEN?.trim()) {
    throw new Error('Set RELEASE_PLEASE_TOKEN to a GitHub App installation token. No fallback token is used.');
  }

  const changelog = release.manifest.replace(/package\.json$/, 'CHANGELOG.md');
  const changelogPath = resolve(cwd, changelog);
  let localContent;
  try { localContent = readFileSync(changelogPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let hasTargetEntry = false;
  if (localContent !== undefined) {
    try {
      extractReleaseNotes(localContent, release.version);
      hasTargetEntry = true;
    } catch (error) {
      if (!error.message.includes('found 0.')) throw error;
    }
  }

  const [, owner, repo] = repository;
  try {
    const github = await createGitHub({ owner, repo, token: env.RELEASE_PLEASE_TOKEN, defaultBranch: branch });
    const manifest = await Manifest.fromConfig(github, branch, {
      releaseType: 'node', component: release.component, releaseAs: release.version,
      includeComponentInTag: true, includeVInTag: true, tagSeparator: '-', skipGithubRelease: true,
    }, { separatePullRequests: true, commitSearchDepth: Number.MAX_SAFE_INTEGER },
    dirname(release.manifest).replaceAll('\\', '/'));
    // Generate a candidate without creating Release Please's separate branch or PR.
    const candidates = await manifest.buildPullRequests();
    if (candidates.length === 0) {
      log(`No releasable changes found for ${release.tag}; existing notes are retained.`);
      return { release, changelog, changed: false, draft: null };
    }
    if (candidates.length !== 1) throw new Error('Expected a single component release candidate.');
    const draft = extractReleaseNotes(candidates[0].body.notes(), release.version);
    if (hasTargetEntry) {
      log(`Existing ${release.tag} notes retained in ${changelog}; refreshed the automatic draft separately.`);
      return { release, changelog, changed: false, draft };
    }
    const updates = candidates[0].updates.filter((update) => update.path === changelog);
    if (updates.length === 0) throw new Error(`Release Please did not produce ${changelog}.`);
    const changes = await github.buildChangeSet(updates, branch);
    const change = changes.get(changelog);
    if (!change || (change.originalContent ?? undefined) !== localContent) {
      throw new Error('The remote changelog differs from the checked-out branch; fetch and retry.');
    }
    extractReleaseNotes(change.content, release.version);
    writeFileSync(changelogPath, change.content);
    log(`Prepared ${release.tag} notes in ${changelog}; no branch, PR, tag or package was created.`);
    return { release, changelog, changed: true, draft };
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      throw new Error('Release Please authentication failed. Check the GitHub App installation and permissions.', { cause: error });
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
      const result = await prepareRelease(args[0]);
      if (process.env.RELEASE_DRAFT_FILE) {
        writeFileSync(resolve(process.env.RELEASE_DRAFT_FILE), result.draft ?? '', 'utf8');
      }
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
