import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseReleaseRef } from './validate-release.mjs';
import { extractReleaseNotes } from './release-notes.mjs';
import { githubClient, releaseNotesContext, releaseNotesOwner, renderPullRequestBody } from './sync-release-notes.mjs';

const draftStart = '<!-- vaia-release-draft:start -->';
const draftEnd = '<!-- vaia-release-draft:end -->';
const syncStart = '<!-- vaia-release-notes-sync:start -->';
const reserved = /<!--\s*vaia-release-(?:draft|notes-sync):(?:start|end)\s*-->/;

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
}

function removeDraftBlock(body) {
  const start = body.indexOf(draftStart);
  const end = body.indexOf(draftEnd);
  if ((start < 0) !== (end < 0) || (start >= 0 && (end < start || body.indexOf(draftStart, start + 1) >= 0 || body.indexOf(draftEnd, end + 1) >= 0))) {
    throw new Error('The automatic draft block is incomplete or duplicated.');
  }
  return start < 0 ? body.trim() : `${body.slice(0, start)}${body.slice(end + draftEnd.length)}`.trim();
}

export function renderAutomaticDraft(body, { draft, status, version }) {
  if (draft && reserved.test(draft)) throw new Error('The generated draft contains reserved synchronization markers.');
  const original = removeDraftBlock(body ?? '');
  const message = status === 'current'
    ? '**Editorial notes match the current candidate. Review them before merging.**'
    : '**Editorial review required:** the release notes are missing or may not describe the current candidate.';
  const content = draft ? draft.trim() : `No release-note entries were generated for ${version}.`;
  const block = [draftStart, message, '', '<details>', '<summary>Automatic draft from commits (not final release notes)</summary>', '', content, '', '</details>', draftEnd].join('\n');
  const position = original.indexOf(syncStart);
  if (position < 0) return `${original}${original ? '\n\n' : ''}${block}\n`;
  return `${original.slice(0, position).trimEnd()}\n\n${block}\n\n${original.slice(position).trimStart()}\n`;
}

export async function updateReleasePr(number, draft, { cwd = process.cwd(), env = process.env, request } = {}) {
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REPOSITORY !== releaseNotesOwner.repository ||
      env.GITHUB_REF !== `refs/heads/${env.RELEASE_BRANCH}`) {
    throw new Error('Automatic release notes require a push to a release branch in imsergiobernal/vaia.');
  }
  const release = parseReleaseRef(env.RELEASE_BRANCH, 'branch');
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Provide a positive release PR number.');
  const head = git(cwd, 'rev-parse', 'HEAD');
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Invalid checked-out head.');
  request ??= githubClient(env.GITHUB_REPOSITORY, env.RELEASE_PLEASE_TOKEN);
  const pr = await request('GET', `pulls/${number}`);
  if (pr.state !== 'open' || pr.merged || pr.number !== number || pr.base?.ref !== 'main' ||
      pr.head?.ref !== env.RELEASE_BRANCH || pr.head?.sha !== head ||
      pr.head?.repo?.full_name !== env.GITHUB_REPOSITORY || pr.base?.repo?.full_name !== env.GITHUB_REPOSITORY) {
    throw new Error('The release PR or branch changed; wait for the latest push workflow.');
  }
  const manifest = JSON.parse(git(cwd, 'show', `${head}:${release.manifest}`));
  if (manifest.version !== release.version) throw new Error('Release branch manifest must match the target version.');
  const changelog = release.manifest.replace(/package\.json$/, 'CHANGELOG.md');
  const entry = extractReleaseNotes(git(cwd, 'show', `${head}:${changelog}`), release.version);
  if (reserved.test(entry)) throw new Error('Release notes contain reserved synchronization markers.');
  if (draft) extractReleaseNotes(draft, release.version);

  let context;
  try { context = releaseNotesContext(pr, { cwd }); }
  catch { /* Missing, invalid or stale provenance requires another editorial review. */ }
  let body = pr.body ?? '';
  if (context) body = renderPullRequestBody(body, context, entry);
  body = renderAutomaticDraft(body, { draft, status: context ? 'current' : 'review-required', version: release.version });
  if (Buffer.byteLength(body) > 60_000) throw new Error('The proposed PR body is too large.');
  const latest = await request('GET', `pulls/${number}`);
  if (latest.state !== pr.state || latest.merged !== pr.merged || latest.number !== pr.number ||
      latest.head?.ref !== pr.head.ref || latest.head?.sha !== pr.head.sha ||
      latest.head?.repo?.full_name !== pr.head.repo.full_name || latest.base?.ref !== pr.base.ref ||
      latest.base?.sha !== pr.base.sha || latest.base?.repo?.full_name !== pr.base.repo.full_name ||
      (latest.body ?? '') !== (pr.body ?? '')) {
    throw new Error('The release PR changed during synchronization; retry on its current head.');
  }
  const changed = body !== (pr.body ?? '');
  if (changed) await request('PATCH', `pulls/${number}`, { body });
  return { changed, status: context ? 'current' : 'review-required' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/update-release-pr.mjs <release-pr-number> <draft-file>');
    const result = await updateReleasePr(Number(process.argv[2]), readFileSync(resolve(process.argv[3]), 'utf8'));
    console.log(`Release PR notes updated: ${result.status}${result.changed ? '' : ' (unchanged)'}.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
