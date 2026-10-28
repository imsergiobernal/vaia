import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const registry = 'https://registry.npmjs.org';

test('published packages and scope resolution target the public npm registry', () => {
  assert.equal(read('.npmrc').trim(), `@imsergiobernal:registry=${registry}`);
  for (const path of ['apps/cli', 'packages/sdk']) {
    const manifest = JSON.parse(read(`${path}/package.json`));
    assert.notEqual(manifest.private, true);
    assert.equal(manifest.publishConfig.registry, registry);
    assert.equal(manifest.publishConfig.access, 'public');
  }
  assert.equal(JSON.parse(read('packages/openapi/package.json')).private, true);
});

for (const component of ['cli', 'sdk']) {
  test(`${component} publication isolates npm authentication from GitHub release credentials`, () => {
    const workflow = read(`.github/workflows/${component}-release.yml`);
    const [build, release] = workflow.split('\n  release:');
    assert.ok(release, 'a separate publication job is required');
    assert.doesNotMatch(build, /id-token: write|NPM_TOKEN/);
    assert.match(release, /id-token: write/);
    assert.doesNotMatch(release, /packages: write|npm\.pkg\.github\.com/);
    assert.match(release, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
    assert.match(release, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(release, /npm stage publish \.\/\*\.tgz --registry https:\/\/registry\.npmjs\.org --access public --ignore-scripts/);
    assert.doesNotMatch(release, /\bnpm publish\b|\bnpm stage approve\b|--otp\b/);
    assert.match(release, /npm@11\.19\.0/);
    assert.match(release, /GITHUB_STEP_SUMMARY/);
    assert.match(release, /https:\/\/www\.npmjs\.com\/settings\/imsergiobernal\/staged-packages/);
    const githubRelease = release.slice(release.indexOf('gh release create'));
    assert.match(githubRelease, /--draft/);
    if (component === 'cli') {
      assert.match(release, /npm view "\$SDK_DEPENDENCY" version --registry https:\/\/registry\.npmjs\.org/);
    }
  });
}
