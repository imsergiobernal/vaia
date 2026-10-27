import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function extractReleaseNotes(changelog, version) {
  // Release Please emits either "## [X.Y.Z](compare-url) (date)" or
  // "## X.Y.Z (date)". H3 sections belong to the same release entry.
  const headings = [...changelog.matchAll(/^##[\t ]+(?:\[([^\]\r\n]+)\]|([^\s]+))[^\r\n]*(?:\r?\n|$)/gm)];
  const matches = headings.filter((heading) => (heading[1] ?? heading[2]) === version);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one CHANGELOG.md entry for ${version}; found ${matches.length}. Merge the preparation PR before finishing with Gitflow.`);
  }
  const heading = matches[0];
  const nextHeading = headings[headings.indexOf(heading) + 1];
  const end = nextHeading?.index ?? changelog.length;
  const body = changelog.slice(heading.index + heading[0].length, end).trim();
  if (!body) throw new Error(`The CHANGELOG.md entry for ${version} has no release notes.`);
  return `${changelog.slice(heading.index, end).trim()}\n`;
}

export function readReleaseNotes(release, { cwd = process.cwd() } = {}) {
  const path = resolve(cwd, dirname(release.manifest), 'CHANGELOG.md');
  let changelog;
  try {
    changelog = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Missing ${dirname(release.manifest)}/CHANGELOG.md. Merge the preparation PR before publishing ${release.tag}.`);
    }
    throw error;
  }
  return extractReleaseNotes(changelog, release.version);
}
