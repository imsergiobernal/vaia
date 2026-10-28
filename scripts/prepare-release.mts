import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractReleaseNotes } from './release-notes.mts';
import { validateReleaseBranch } from './validate-release.mts';
import { errorMessage, hasErrorCode, isMainModule, type ReleaseRef, type WorkingDirectoryOptions } from './shared.mts';

export interface PreparedRelease {
  release: ReleaseRef;
  changelog: string;
  changed: boolean;
}

const sections: Record<string, string> = {
  feat: 'Features', fix: 'Bug Fixes', perf: 'Performance Improvements',
  deps: 'Dependencies', docs: 'Documentation', refactor: 'Code Refactoring', revert: 'Reverts',
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Generate the component's initial notes from the committed local history. */
export function prepareRelease(branch: string, { cwd = process.cwd() }: WorkingDirectoryOptions = {}): PreparedRelease {
  const release = validateReleaseBranch(branch, { cwd });
  if (git(cwd, 'branch', '--show-current') !== branch) throw new Error(`Check out ${branch} before preparing its changelog.`);
  if (git(cwd, 'rev-parse', '--is-shallow-repository') === 'true') throw new Error('A complete Git history and local release tags are required.');

  const changelog = release.manifest.replace(/package\.json$/, 'CHANGELOG.md');
  const changelogPath = resolve(cwd, changelog);
  let content: string;
  try { content = readFileSync(changelogPath, 'utf8'); }
  catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) throw error;
    content = '# Changelog\n';
  }
  try {
    extractReleaseNotes(content, release.version);
    console.log(`Existing ${release.tag} notes retained in ${changelog}.`);
    return { release, changelog, changed: false };
  } catch (error) {
    if (!errorMessage(error).includes('found 0.')) throw error;
  }

  const tags = git(cwd, 'tag', '--merged', 'HEAD', '--list', `${release.component}-v*`).split('\n')
    .filter((tag) => /^(cli|sdk)-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag));
  const previousTag = tags.length ? git(cwd, 'describe', '--tags', '--abbrev=0', ...tags.flatMap((tag) => ['--match', tag]), 'HEAD') : null;
  const paths = release.component === 'cli' ? ['apps/cli'] : ['packages/sdk', 'packages/openapi'];
  const commits = git(cwd, 'log', '--no-merges', '--format=%H%x00%B%x00', ...(previousTag ? [`${previousTag}..HEAD`] : ['HEAD']), '--', ...paths).split('\0');
  const grouped = new Map<string, string[]>();
  for (let index = 0; index + 1 < commits.length; index += 2) {
    const message = commits[index + 1].trim();
    const [subject] = message.split(/\r?\n/);
    const match = /^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/.exec(subject);
    if (!match) continue;
    const breaking = Boolean(match[3]) || /^BREAKING[ -]CHANGE:\s*\S/m.test(message);
    const section = breaking ? 'Breaking Changes' : sections[match[1]];
    if (!section) continue;
    const entries = grouped.get(section) ?? [];
    entries.push(`* ${match[4]}`);
    grouped.set(section, entries);
  }
  if (!grouped.size) {
    console.log(`No releasable changes found for ${release.tag}; ${changelog} was not changed.`);
    return { release, changelog, changed: false };
  }
  const date = new Date().toISOString().slice(0, 10);
  const notes = [`## ${release.version} (${date})`, ...[...grouped].map(([heading, entries]) => `### ${heading}\n\n${entries.join('\n')}`)].join('\n\n');
  const heading = /^# Changelog[^\r\n]*(?:\r?\n|$)/i.exec(content);
  const updated = heading
    ? `${content.slice(0, heading[0].length).trimEnd()}\n\n${notes}\n\n${content.slice(heading[0].length).trimStart()}`
    : `# Changelog\n\n${notes}\n\n${content.trimStart()}`;
  extractReleaseNotes(updated, release.version);
  writeFileSync(changelogPath, updated.trimEnd() + '\n');
  console.log(`Prepared ${release.tag} notes in ${changelog} from local commits. Review them before committing.`);
  return { release, changelog, changed: true };
}

if (isMainModule(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
      console.log('Usage: pnpm release:prepare <release|hotfix>/<cli|sdk>-vX.Y.Z');
    } else {
      if (args.length !== 1) throw new Error('Usage: pnpm release:prepare <release|hotfix>/<cli|sdk>-vX.Y.Z');
      prepareRelease(args[0]);
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
