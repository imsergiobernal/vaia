import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseReleaseRef } from './validate-release.mjs';
import { extractReleaseNotes } from './release-notes.mjs';

export const releaseNotesOwner = { login: 'imsergiobernal', id: '20087388', repository: 'imsergiobernal/vaia' };
const reviewStart = '<!-- vaia-release-notes-sync:start -->';
const reviewEnd = '<!-- vaia-release-notes-sync:end -->';
const hash = (value) => createHash('sha256').update(value ?? '').digest('hex');

export function authorizeReleaseNotes(env) {
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_REPOSITORY !== releaseNotesOwner.repository ||
      env.GITHUB_REF !== 'refs/heads/develop' ||
      env.GITHUB_ACTOR_ID !== releaseNotesOwner.id || env.GITHUB_ACTOR !== releaseNotesOwner.login ||
      env.GITHUB_TRIGGERING_ACTOR !== releaseNotesOwner.login) {
    throw new Error('Only imsergiobernal may run or rerun release notes synchronization from develop in imsergiobernal/vaia.');
  }
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

export function githubClient(repository, token, fetchImpl = fetch) {
  if (repository !== releaseNotesOwner.repository) throw new Error('Release notes synchronization is limited to imsergiobernal/vaia.');
  if (!token?.trim()) throw new Error('A GitHub token is required.');
  return async (method, path, body) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
      method, headers: {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${path} failed (HTTP ${response.status}).`);
    return response.json();
  };
}

function markerFor(entry) {
  const markers = [...entry.matchAll(/^<!-- vaia-release-notes (\{[^\r\n]*\}) -->\r?$/gm)];
  if (markers.length !== 1) throw new Error('The target changelog entry needs exactly one vaia-release-notes provenance marker.');
  return { marker: markers[0][0], provenance: JSON.parse(markers[0][1]) };
}

export function releaseNotesContext(pr, { cwd = process.cwd() } = {}) {
  const repository = releaseNotesOwner.repository;
  if (pr.state !== 'open' || pr.merged || pr.head?.repo?.full_name !== repository || pr.base?.repo?.full_name !== repository || pr.base.ref !== 'main') {
    throw new Error('Select an open, unmerged same-repository release PR targeting main.');
  }
  const release = parseReleaseRef(pr.head.ref, 'branch');
  for (const side of [pr.base, pr.head]) {
    if (!/^[a-f0-9]{40}$/.test(side.sha) || /[\x00-\x20~^:?*\[\\]/.test(side.ref)) throw new Error('Invalid PR ref or commit SHA.');
    git(cwd, 'cat-file', '-e', `${side.sha}^{commit}`);
  }
  const manifest = JSON.parse(git(cwd, 'show', `${pr.head.sha}:${release.manifest}`));
  if (manifest.version !== release.version) throw new Error('Release branch manifest must match the target version.');
  const changelog = release.manifest.replace(/package\.json$/, 'CHANGELOG.md');
  const entry = extractReleaseNotes(git(cwd, 'show', `${pr.head.sha}:${changelog}`), release.version);
  const { provenance } = markerFor(entry);
  const candidate = provenance.candidate;
  if (!/^[a-f0-9]{40}$/.test(candidate ?? '') || candidate === pr.head.sha ||
      spawnSync('git', ['merge-base', '--is-ancestor', candidate, pr.head.sha], { cwd }).status !== 0) {
    throw new Error('Notes candidate must be an earlier ancestor of the release branch head.');
  }
  const files = git(cwd, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', candidate, pr.head.sha).split('\0').filter(Boolean);
  if (files.length !== 1 || files[0] !== changelog) throw new Error('The release candidate changed after drafting notes; draft them again.');
  const tags = git(cwd, 'tag', '--merged', candidate, '--list', `${release.component}-v*`)
    .trim().split('\n').filter((tag) => new RegExp(`^${release.component}-v(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)$`).test(tag));
  const previousTag = tags.length ? git(cwd, 'describe', '--tags', '--abbrev=0', ...tags.flatMap((tag) => ['--match', tag]), candidate).trim() : null;
  const context = {
    number: pr.number, component: release.component, version: release.version, changelog,
    baseRef: pr.base.ref, baseSha: pr.base.sha, headRef: pr.head.ref, headSha: pr.head.sha,
    candidateSha: candidate, bodyHash: hash(pr.body), previousTag,
  };
  validateDraftProvenance(entry, context);
  return context;
}

export function validateDraftProvenance(entry, context) {
  const { marker, provenance } = markerFor(entry);
  const expected = { component: context.component, version: context.version, candidate: context.candidateSha, previous_tag: context.previousTag };
  if (!isDeepStrictEqual(provenance, expected)) throw new Error('The drafted notes describe a different candidate, component or previous tag. Draft them again.');
  const withoutMarker = entry.replace(marker, '').split(/\r?\n/).slice(1).join('\n').trim();
  if (!withoutMarker || !withoutMarker.split('\n').some((line) => /\p{L}/u.test(line) && !/^\s*(?:#|<!--)/.test(line))) {
    throw new Error('The drafted notes must contain release content beyond headings and metadata.');
  }
}

export function renderPullRequestBody(body, context, entry) {
  const original = (body ?? '').trim();
  const start = original.indexOf(reviewStart);
  const end = original.indexOf(reviewEnd);
  if ((start < 0) !== (end < 0) || (start >= 0 && (end < start || original.indexOf(reviewStart, start + 1) >= 0 || original.indexOf(reviewEnd, end + 1) >= 0))) {
    throw new Error('The previous synchronization block is incomplete or duplicated.');
  }
  const kept = start < 0 ? original : `${original.slice(0, start)}${original.slice(end + reviewEnd.length)}`.trim();
  const review = [reviewStart, entry.trim(), '',
    `Notes synchronized by imsergiobernal from \`${context.headSha}\` for candidate \`${context.candidateSha}\`, compared with ${context.previousTag ? `\`${context.previousTag}\`` : 'the empty tree (first release)'}.`,
    reviewEnd].join('\n');
  return `${kept ? `${kept}\n\n` : ''}${review}\n`;
}

export async function syncReleaseNotes(number, { cwd = process.cwd(), env = process.env, request } = {}) {
  authorizeReleaseNotes(env);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Provide a positive release PR number.');
  request ??= githubClient(env.GITHUB_REPOSITORY, env.GITHUB_TOKEN);
  const pr = await request('GET', `pulls/${number}`);
  const context = releaseNotesContext(pr, { cwd });
  const entry = extractReleaseNotes(git(cwd, 'show', `${context.headSha}:${context.changelog}`), context.version);
  const body = renderPullRequestBody(pr.body, context, entry);
  if (Buffer.byteLength(body) > 60_000) throw new Error('The proposed PR body is too large.');
  const latest = await request('GET', `pulls/${number}`);
  let fresh;
  try { fresh = releaseNotesContext(latest, { cwd }); }
  catch (error) { throw new Error('The PR changed during synchronization. Rerun after reviewing the latest candidate.', { cause: error }); }
  if (!isDeepStrictEqual(fresh, context)) throw new Error('The PR changed during synchronization. Rerun after reviewing the latest candidate.');
  const changed = body !== latest.body;
  if (changed) await request('PATCH', `pulls/${number}`, { body });
  return { context, entry, changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/sync-release-notes.mjs <release-pr-number>');
    const result = await syncReleaseNotes(Number(process.argv[2]));
    console.log(`Synchronized ${result.context.component} ${result.context.version} notes for PR #${result.context.number}.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
