import { readFileSync } from 'node:fs';
import { parseReleaseRef } from './validate-release.mts';
import { errorMessage, isMainModule, isRecord, parseJson } from './shared.mts';

export function validateSyncPullRequest(pr: unknown, repository: string): string {
  if (!isRecord(pr) || pr.merged !== true || !isRecord(pr.base) || pr.base.ref !== 'main' ||
      !isRecord(pr.base.repo) || pr.base.repo.full_name !== repository || !isRecord(pr.head) ||
      !isRecord(pr.head.repo) || pr.head.repo.full_name !== repository || typeof pr.head.ref !== 'string') {
    throw new Error('Expected a merged release or hotfix PR from this repository into main.');
  }
  parseReleaseRef(pr.head.ref, 'branch');
  if (typeof pr.merge_commit_sha !== 'string' || !/^[0-9a-f]{40}$/.test(pr.merge_commit_sha)) {
    throw new Error('The PR must have a valid merge commit SHA.');
  }
  return pr.merge_commit_sha;
}

if (isMainModule(import.meta.url)) {
  try {
    const [file, repository, ...extra] = process.argv.slice(2);
    if (!file || !repository || extra.length) throw new Error('Expected a PR JSON file and repository.');
    console.log(validateSyncPullRequest(parseJson(readFileSync(file, 'utf8')), repository));
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}
