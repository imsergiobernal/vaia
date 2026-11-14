import assert from 'node:assert/strict';
import { test } from 'node:test';
import { versionsToPublish } from './sync-github-packages.mts';

const entry = (integrity) => ({ dist: { integrity } });
const digest = 'sha512-example';

test('selects approved tagged versions that GitHub Packages does not have', () => {
  const tags = ['cli-v0.1.0', 'cli-v0.2.0', 'cli-v0.3.0', 'sdk-v0.1.0', 'cli-v1.0.0-beta'];
  const npm = { '0.1.0': entry(digest), '0.2.0': entry(digest) };
  const github = { '0.1.0': entry(digest) };
  assert.deepEqual(versionsToPublish(tags, 'cli-v', npm, github), [
    { tag: 'cli-v0.2.0', version: '0.2.0', integrity: digest },
  ]);
});

test('rejects a mismatched version already in GitHub Packages', () => {
  assert.throws(() => versionsToPublish(
    ['sdk-v0.1.0'], 'sdk-v', { '0.1.0': entry(digest) }, { '0.1.0': entry('sha512-other') },
  ), /differs from npm/);
});

test('rejects npm versions without SHA-512 integrity', () => {
  assert.throws(() => versionsToPublish(
    ['sdk-v0.1.0'], 'sdk-v', { '0.1.0': { dist: {} } }, {},
  ), /SHA-512/);
});
