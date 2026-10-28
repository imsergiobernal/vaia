import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseReleaseRef } from './validate-release.mjs';

export function validateSyncPullRequest(pr, repository) {
  if (!pr || pr.merged !== true || pr.base?.ref !== 'main' ||
      pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository) {
    throw new Error('Expected a merged release or hotfix PR from this repository into main.');
  }
  parseReleaseRef(pr.head.ref, 'branch');
  if (!/^[0-9a-f]{40}$/.test(pr.merge_commit_sha ?? '')) {
    throw new Error('The PR must have a valid merge commit SHA.');
  }
  return pr.merge_commit_sha;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [file, repository, ...extra] = process.argv.slice(2);
    if (!file || !repository || extra.length) throw new Error('Expected a PR JSON file and repository.');
    console.log(validateSyncPullRequest(JSON.parse(readFileSync(file, 'utf8')), repository));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
