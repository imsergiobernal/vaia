import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractReleaseNotes } from './release-notes.mjs';

test('extracts only the requested Release Please entry, including its H3 sections', () => {
  const changelog = '# Changelog\n\n## [0.3.0](https://example.invalid/compare/cli-v0.2.0...cli-v0.3.0) (2026-10-27)\n\n### Features\n\n* New feature.\n\n### Bug Fixes\n\n* Fixed a bug.\n\n## [0.2.0](https://example.invalid/compare/cli-v0.1.0...cli-v0.2.0) (2026-10-01)\n\n* Previous feature.\n';
  const notes = extractReleaseNotes(changelog, '0.3.0');
  assert.match(notes, /^## \[0\.3\.0\]/);
  assert.match(notes, /### Features/);
  assert.match(notes, /### Bug Fixes/);
  assert.doesNotMatch(notes, /Previous feature/);
  assert.equal(extractReleaseNotes(changelog, '0.2.0'), '## [0.2.0](https://example.invalid/compare/cli-v0.1.0...cli-v0.2.0) (2026-10-01)\n\n* Previous feature.\n');
});

test('accepts unlinked initial-release headings and Windows line endings', () => {
  const changelog = '# Changelog\r\n\r\n## 0.1.0 (2026-10-27)\r\n\r\n* Initial release.\r\n';
  assert.match(extractReleaseNotes(changelog, '0.1.0'), /Initial release/);
});

test('rejects absent, ambiguous and empty notes instead of publishing another version', () => {
  assert.throws(() => extractReleaseNotes('## 0.2.01\n\n* Wrong version.\n', '0.2.0'), /found 0/);
  assert.throws(() => extractReleaseNotes('## 0.2.0\n\n* One.\n\n## [0.2.0]\n\n* Two.\n', '0.2.0'), /found 2/);
  assert.throws(() => extractReleaseNotes('## 0.2.0\n\n## 0.1.0\n\n* Previous.\n', '0.2.0'), /has no release notes/);
});
