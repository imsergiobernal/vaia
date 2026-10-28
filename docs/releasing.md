# Releases and hotfixes

CLI and SDK have independent versions and publications. Each release branch prepares
exactly one component. `main` still integrates the code of the whole monorepo.

| Component | Release branch | Hotfix branch | Tag | Manifest version |
| --- | --- | --- | --- | --- |
| CLI | `release/cli-v0.2.0` | `hotfix/cli-v0.2.1` | `cli-v0.2.0` | `0.2.0` |
| SDK | `release/sdk-v0.3.0` | `hotfix/sdk-v0.3.1` | `sdk-v0.3.0` | `0.3.0` |

The format is `release/<component>-v<MAJOR.MINOR.PATCH>` or
`hotfix/<component>-v<MAJOR.MINOR.PATCH>`. Only `cli` and `sdk` are supported.
Use stable SemVer numbers without leading zeroes, dates, descriptions, prerelease
suffixes or build metadata. The branch names the final target version.

## Activate Git Flow Next

Install Git Flow Next (also listed in `.config/configuration.winget`). With a
version that supports shared configuration, activate the committed `.gitflow`:

```sh
git flow config sync
git flow config status
```

The shared configuration starts releases at `develop` and hotfixes at `main`.
The release PR is merged into `main` in GitHub. Finalization below tags the
actual PR merge commit and merges `main` into `develop`; do not run `git flow
release finish` after merging the PR, since that would perform another merge.

## Configure the preparation bot

Release Please `17.11.2` is pinned in the workspace lockfile. On each pushed
`release/*` or `hotfix/*` branch, the preparation workflow generates the target
component's initial changelog entry on that branch and opens one PR from the
same branch to `main`. It never creates a separate preparation branch, tag,
GitHub Release or package publication. The remote `main` branch must exist and
be accessible to the App before preparation starts.

Create a GitHub App under your account's **Settings > Developer settings > GitHub
Apps**, or use an existing App dedicated to this repository:

1. Set its homepage to this repository, disable webhooks (the workflow invokes
   the App directly), and grant these repository permissions: **Contents: read
   and write**, **Pull requests: read and write**, and **Issues: read and write**.
2. Install the App using **Only select repositories**, selecting only `vaia`.
3. In the repository's **Settings > Secrets and variables > Actions**, set the
   variable `RELEASE_PLEASE_APP_ID` to the App ID, and the secret
   `RELEASE_PLEASE_APP_PRIVATE_KEY` to a generated PEM private key. Keep the key
   out of Git, logs and issue/PR bodies.

The workflow generates a short-lived installation token limited to this
repository and these permissions. The token is revoked when the job ends.
Missing configuration or rejected authentication fails with a configuration
message; there is no fallback to `GITHUB_TOKEN`. Using the App allows the existing
PR CI to run automatically on the release PR.

## Configure npm publication

Both packages publish publicly to `https://registry.npmjs.org` under the
`@imsergiobernal` scope. The npm account or organization must own that scope and
the publishing identity must have write access to both packages.

The publication jobs use Node.js 24 and npm 11.19.0. Staged publishing requires
at least npm 11.15.0. Build and consumer checks continue to use Node.js 22.

Enable 2FA on the npm account that will approve releases. Create an npm granular
access token with write access to this scope, preferably **Read and write (stage
only)**, and leave **Bypass 2FA disabled**. Save it as the repository Actions
secret `NPM_TOKEN`. An existing token with **Read and write (publish and stage)**
and bypass disabled can also stage packages. Never commit the token or paste it
into release notes. Replace the secret when the token expires.

The workflows run `npm stage publish` against the verified tarball. This uploads
the release for review without prompting the runner for 2FA. You approve it
separately on npm with your own 2FA. Staging also supports the first release of
a new package; npm creates a public `0.0.0-stage` placeholder while the actual
staged version's contents remain unavailable until approval. See
[npm staged publishing](https://docs.npmjs.com/staged-publishing/).

To avoid renewing tokens later, configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
in each package's npm settings with these values:

| Package | GitHub owner | Repository | Workflow filename |
| --- | --- | --- | --- |
| `@imsergiobernal/vaia-sdk` | `imsergiobernal` | `vaia` | `sdk-release.yml` |
| `@imsergiobernal/vaia-cli` | `imsergiobernal` | `vaia` | `cli-release.yml` |

Leave the environment name empty and allow **staging only** (`npm stage publish`),
with direct publishing disabled. The publication jobs grant `id-token: write`
for OIDC; manual approval with 2FA remains required. Complete the first successful
use within npm's initial validation window (currently two days); recreate the
configuration if it expires. Once both workflows successfully stage through
OIDC, remove `NPM_TOKEN`. `GITHUB_TOKEN` is used to create draft GitHub Releases.

## Open and stabilize a release

Start from a clean working tree and update the target component's version as part
of opening the branch. For example, for CLI `0.2.0`:

```sh
git flow release start cli-v0.2.0
pnpm --dir apps/cli version 0.2.0 --no-git-tag-version
node scripts/validate-release.mjs branch release/cli-v0.2.0
git add apps/cli/package.json
git commit -m "chore(cli): prepare 0.2.0"
git flow release publish cli-v0.2.0
```

For the SDK use `sdk-v<version>` and `pnpm --dir packages/sdk version <version>
--no-git-tag-version`. These version commands update the selected package and
workspace metadata as needed, without creating a second Git tag. Commit any
resulting lockfile change together with the manifest. If the version is already
correct (for example, the first `0.1.0` release), skip the version command and
commit.

Each push runs the **Prepare release branch** workflow. Release Please uses the
branch's component and target version to generate the first changelog entry from
component history. The workflow commits that entry to the release branch and
opens a single PR to `main`; later pushes update that same PR. The App needs
permission to push to the release branch; branch protection must permit the App.

An existing entry for the target version is retained, so repeated runs never
silently overwrite manually drafted notes. After source changes, update and review
the entry again before merging. If no releasable commits exist, preparation fails
rather than opening a PR without notes. For a CLI release containing only SDK
changes, use a `deps(cli)` commit touching the CLI manifest.

For local preparation set `GITHUB_REPOSITORY=imsergiobernal/vaia` and
`RELEASE_PLEASE_TOKEN` to an installation token from the same App, then run:

```sh
pnpm release:prepare release/cli-v0.2.0
```

This writes the changelog in the checkout only if the entry does not already
exist. It does not create a branch, commit, PR, tag or publication. Never put
credentials on the command line or commit them in a configuration file.

Use the branch for corrections, documentation and package preparation. Continue
new features on `develop`. Do not bump the other component just to match versions.
An SDK release must still build and type-check the CLI and pass its smoke checks.
It does not publish the CLI.

The CLI package is published as `@imsergiobernal/vaia-cli` and exposes the `vaia`
command. Packing converts its workspace SDK dependency into the exact current
`@imsergiobernal/vaia-sdk` version. Publish that SDK version with its `sdk-vX.Y.Z`
tag and approve it in npm before pushing the CLI tag; an already published SDK
version can be reused.
The CLI publisher checks that dependency in npm before publishing,
and fails with a message if it is unavailable. CI tests the CLI tarball with a
local packed SDK so development does not require publishing either package.

## Draft final release notes

The maintainer `imsergiobernal` (GitHub user ID `20087388`) drafts notes in a
personal Codex session. The **Sync release notes** workflow runs manually from
`develop` in `imsergiobernal/vaia` and checks the original actor and rerun actor.
It uses trusted scripts from `develop`, reads the release branch's committed
changelog and updates only the PR body; it does not start Codex, merge or publish.
Keep the Codex environment private; repository prompts and markers do not
independently authenticate an agent or reviewer.

1. Wait for **Prepare release branch** and open the PR from the release branch
   to `main`. Stabilize source and dependency changes on that same branch.
2. Ask Codex to follow [the release notes prompt](../.github/codex/prompts/release-notes.md)
   for the release PR. It compares the candidate with the nearest reachable stable
   tag of the same component, or the empty tree for a first release. Review the
   resulting notes and source evidence.
3. Commit and push the notes to the same release branch. The entry must contain
   exactly one freshness marker, using the candidate SHA captured before the
   notes commit and `null` for the first release:

   ```html
   <!-- vaia-release-notes {"component":"cli","version":"0.2.0","candidate":"<40-character-candidate-sha>","previous_tag":"cli-v0.1.0"} -->
   ```

4. In **Actions > Sync release notes > Run workflow**, select `develop` and
   provide the release PR number. The workflow must already exist on the default
   branch before GitHub offers its manual trigger. The synchronizer requires the
   candidate to be an ancestor of the release head and permits only the component
   changelog to differ from that candidate. It preserves existing PR text and
   replaces only its own notes block. Redraft after later source changes.
5. Review the changelog and PR, wait for CI, and run the same checks locally:

   ```sh
   pnpm install --frozen-lockfile
   pnpm test
   pnpm --filter '@imsergiobernal/vaia-cli...' --fail-if-no-match -r run build
   pnpm --filter '@imsergiobernal/vaia-cli...' --fail-if-no-match -r run typecheck
   ```

## Finish and publish

Merge the reviewed release PR into `main` using a merge commit. Record the
exact merge commit SHA shown by GitHub as `<PR_MERGE_COMMIT_SHA>`; use that SHA
rather than whichever commit `main` happens to point at later. Update `develop`
from `main`, then create and push the component tag on the merge commit:

```sh
git fetch origin --tags
git merge-base --is-ancestor <PR_MERGE_COMMIT_SHA> origin/main
git switch develop
git pull --ff-only origin develop
git merge --no-ff origin/main
git push origin develop
git tag -a cli-v0.2.0 <PR_MERGE_COMMIT_SHA> -m "cli-v0.2.0"
git push origin refs/tags/cli-v0.2.0
```

Resolve and review any merge conflicts before pushing `develop`. The PR merge has
already updated `main`; do not run `git flow release finish` afterwards. The tag
must name the approved PR's merge commit. A merge commit preserves the release
branch history and allows the tag validator to check its ancestry in `main`.

Do not publish all tags together. The tag triggers only the matching workflow:

- `cli-v*`: checks the CLI version and `main` history, builds the CLI and SDK,
  installs and verifies the packed CLI outside the workspace, verifies the
  extracted production bundle, stages the same CLI `.tgz` in npm for approval,
  and attaches both archives to a draft GitHub Release.
- `sdk-v*`: checks the SDK version and `main` history, verifies CLI compatibility,
  installs the packed SDK in an isolated consumer, checks its runtime and types,
  and stages that same `.tgz` in npm for approval, attaching it to a draft
  GitHub Release.

The SDK GitHub Release does not replace the CLI as the repository's latest
release. npm staging uses OIDC or the `NPM_TOKEN` described above;
only publication jobs receive write permissions. npm installation instructions are in
`apps/cli/README.md` and `packages/sdk/README.md`.

Both publishers require a single, nonempty `CHANGELOG.md` entry matching the
tagged version in the corresponding package. The validator exports that exact
entry to `release-notes.md`, which travels with the verified assets and becomes
the GitHub Release body. Missing, duplicate or empty entries fail before building
or publishing; notes from another component or version are never substituted.

Branch pushes validate and prepare PRs; tags stage packages for approval. CI checks release/hotfix
names and manifest versions on both PR head and target branches. A tag must match its own
component's manifest, and its exact commit must already be an ancestor of
`origin/main`. Full history is fetched for that check. Older integrated tags can
still be validated when `main` has advanced.

For the first release, push the setup changes, configure the App, and ensure the
preparation workflow, validator and locked dependency exist on the stabilization
branch. Manual publication dispatch requires its workflow to exist on `main` and
accepts only an existing tag with the same validation as tag-triggered runs.

Validate the setup with the first real release: confirm exactly one PR from
its release branch to `main`, verify the workflow and CI, review the notes, and
only then merge and push the tag. Avoid disposable test tags: a matching tag
integrated into `main` is a real staging trigger.

### Approve and publish the release

A green release workflow means the package is staged and the GitHub Release is
a draft. The workflow finishes without waiting for a 2FA code. Its run summary
links to npm and explains the remaining steps:

1. Open [npm Staged Packages](https://www.npmjs.com/settings/imsergiobernal/staged-packages).
   Review the package name and version against the release tag and inspect the
   staged tarball if needed.
2. Select **Approve** and complete npm's 2FA verification. This makes the version
   available on npm. For an SDK release, finish this before triggering a CLI
   release that depends on that exact SDK version.
3. In this repository's **Releases**, edit the matching draft and publish it.
   For an SDK release, leave **Set as latest release** disabled; the CLI remains
   the repository's latest release.

You can also approve from a local authenticated terminal with
`npm stage approve <stage-id>`, which prompts for 2FA. Do not supply a 2FA code
to GitHub Actions or store it as a secret.

If approval is rejected or abandoned, the actual release version remains
unpublished and the GitHub Release stays a draft. Staged versions reserve their
package/version pair: do not rerun staging just to approve it. If a workflow
fails after staging, inspect the existing staged package and draft before
retrying; recover the draft from the verified run artifacts as needed.

## Hotfixes

Use the same single-PR process with `git flow hotfix start cli-v0.2.1` (or
`sdk-v<version>`). Hotfixes start at `main`; update the selected manifest, push
the branch, review its PR to `main`, then tag the exact PR merge commit and merge
`main` into `develop`. Do not run `git flow hotfix finish` after merging the PR.
