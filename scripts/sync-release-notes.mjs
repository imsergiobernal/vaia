import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseReleaseRef } from './validate-release.mjs';
import { extractReleaseNotes } from './release-notes.mjs';

export const releaseNotesOwner = { login: 'imsergiobernal', id: '20087388', repository: 'imsergiobernal/vaia' };
const reviewStart = '<!-- vaia-release-notes-sync:start -->';
const reviewEnd = '<!-- vaia-release-notes-sync:end -->';
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function authorizeReleaseNotes(env) {
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REPOSITORY !== releaseNotesOwner.repository ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_ACTOR_ID !== releaseNotesOwner.id ||
      env.GITHUB_ACTOR !== releaseNotesOwner.login ||
      env.GITHUB_TRIGGERING_ACTOR !== releaseNotesOwner.login) {
    throw new Error('Only imsergiobernal may run or rerun release notes synchronization from main in imsergiobernal/vaia.');
  }
}

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function githubClient(repository, token, fetchImpl = fetch) {
  if (repository !== releaseNotesOwner.repository) throw new Error('Release notes synchronization is limited to imsergiobernal/vaia.');
  if (!token?.trim()) throw new Error('A GitHub token is required.');
  return async (method, path, body) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path} failed (HTTP ${response.status}).`);
    return response.json();
  };
}

function splitPullRequestBody(body, version) {
  const lines = (body ?? '').replaceAll('\r\n', '\n').split('\n');
  const first = lines.indexOf('---');
  const last = lines.lastIndexOf('---');
  if (first < 0 || first === last) throw new Error('The preparation PR body has an unsupported format.');
  const notes = lines.slice(first + 1, last).join('\n').trim();
  if (extractReleaseNotes(notes, version).trim() !== notes) throw new Error('The PR body must describe exactly the target release.');
  let footer = lines.slice(last + 1).join('\n').trim();
  const start = footer.indexOf(reviewStart);
  if (start >= 0) {
    const end = footer.indexOf(reviewEnd, start);
    if (end < 0) throw new Error('The previous synchronization block is incomplete.');
    footer = `${footer.slice(0, start)}${footer.slice(end + reviewEnd.length)}`.trim();
  }
  return { header: lines.slice(0, first).join('\n').trim(), footer };
}

export function releaseNotesContext(pr, { cwd = process.cwd() } = {}) {
  const repository = releaseNotesOwner.repository;
  if (pr.state !== 'open' || pr.merged || pr.head?.repo?.full_name !== repository || pr.base?.repo?.full_name !== repository) {
    throw new Error('Select an open, unmerged preparation PR in imsergiobernal/vaia.');
  }
  if (!pr.labels?.some((label) => label.name === 'autorelease: pending') || !pr.head.ref.startsWith('release-please--')) {
    throw new Error('The PR must be an existing Release Please preparation PR.');
  }
  for (const side of [pr.base, pr.head]) {
    if (!/^[a-f0-9]{40}$/.test(side.sha) || /[\x00-\x20~^:?*\[\\]/.test(side.ref)) throw new Error('Invalid PR ref or commit SHA.');
    git(cwd, 'cat-file', '-e', `${side.sha}^{commit}`);
  }
  const release = parseReleaseRef(pr.base.ref, 'branch');
  splitPullRequestBody(pr.body, release.version);
  const manifests = [pr.base.sha, pr.head.sha].map((sha) => JSON.parse(git(cwd, 'show', `${sha}:${release.manifest}`)));
  if (manifests.some((manifest) => manifest.version !== release.version) || !isDeepStrictEqual(...manifests)) {
    throw new Error('Candidate and preparation manifests must match the target version and dependencies.');
  }
  const changelog = release.manifest.replace(/package\.json$/, 'CHANGELOG.md');
  const preparationFiles = git(cwd, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', pr.base.sha, pr.head.sha).split('\0').filter(Boolean);
  if (preparationFiles.some((path) => path !== release.manifest && path !== changelog)) {
    throw new Error('Move source changes from the preparation PR to its stabilization branch before drafting notes.');
  }
  const tags = git(cwd, 'tag', '--merged', pr.base.sha, '--list', `${release.component}-v*`)
    .trim().split('\n').filter((tag) => new RegExp(`^${release.component}-v(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)$`).test(tag));
  const previousTag = tags.length
    ? git(cwd, 'describe', '--tags', '--abbrev=0', ...tags.flatMap((tag) => ['--match', tag]), pr.base.sha).trim()
    : null;
  return {
    number: pr.number, component: release.component, version: release.version, changelog,
    baseRef: pr.base.ref, baseSha: pr.base.sha, headRef: pr.head.ref, headSha: pr.head.sha,
    bodyHash: hash(pr.body), previousTag,
  };
}

export function validateDraftProvenance(entry, context) {
  const markers = [...entry.matchAll(/^<!-- vaia-release-notes (\{[^\r\n]*\}) -->\r?$/gm)];
  if (markers.length !== 1) throw new Error('The target changelog entry needs exactly one vaia-release-notes provenance marker.');
  const provenance = JSON.parse(markers[0][1]);
  const expected = {
    component: context.component, version: context.version,
    candidate: context.baseSha, previous_tag: context.previousTag,
  };
  if (!isDeepStrictEqual(provenance, expected)) {
    throw new Error('The drafted notes describe a different candidate, component or previous tag. Draft them again before synchronizing.');
  }
  const withoutMarker = entry.replace(markers[0][0], '').split(/\r?\n/).slice(1).join('\n').trim();
  if (!withoutMarker || !withoutMarker.split('\n').some((line) => /\p{L}/u.test(line) && !/^\s*(?:#|<!--)/.test(line))) {
    throw new Error('The drafted notes must contain release content beyond headings and metadata.');
  }
}

export function renderPullRequestBody(body, context, entry) {
  const { header, footer } = splitPullRequestBody(body, context.version);
  const review = [reviewStart,
    `Notes synchronized by imsergiobernal from \`${context.headSha}\` for candidate \`${context.baseSha}\`, compared with ${context.previousTag ? `\`${context.previousTag}\`` : 'the empty tree (first release)'}.`,
    reviewEnd,
  ].join('\n');
  return `${header}\n---\n\n${entry.trim()}\n\n---\n${footer}\n\n${review}\n`;
}

export async function syncReleaseNotes(number, {
  cwd = process.cwd(), env = process.env, request,
} = {}) {
  // Check the original actor AND rerun actor before constructing any API client.
  authorizeReleaseNotes(env);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Provide a positive preparation PR number.');
  request ??= githubClient(env.GITHUB_REPOSITORY, env.GITHUB_TOKEN);
  const pr = await request('GET', `pulls/${number}`);
  const context = releaseNotesContext(pr, { cwd });
  const changelog = git(cwd, 'show', `${context.headSha}:${context.changelog}`);
  const entry = extractReleaseNotes(changelog, context.version);
  validateDraftProvenance(entry, context);
  const body = renderPullRequestBody(pr.body, context, entry);
  if (Buffer.byteLength(body) > 60_000) throw new Error('The proposed PR body is too large.');
  const latest = await request('GET', `pulls/${number}`);
  const fresh = releaseNotesContext(latest, { cwd });
  if (!isDeepStrictEqual(fresh, context)) throw new Error('The PR changed during synchronization. Rerun after reviewing the latest candidate.');
  const changed = body !== latest.body;
  if (changed) await request('PATCH', `pulls/${number}`, { body });
  return { context, entry, changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/sync-release-notes.mjs <preparation-pr-number>');
    const result = await syncReleaseNotes(Number(process.argv[2]));
    console.log(`Synchronized ${result.context.component} ${result.context.version} notes for PR #${result.context.number}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
