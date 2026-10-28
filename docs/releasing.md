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
node --experimental-strip-types scripts/validate-release.mts branch release/cli-v0.2.0
git add apps/cli/package.json
git commit -m "chore(cli): prepare 0.2.0"
```

For the SDK use `sdk-v<version>` and `pnpm --dir packages/sdk version <version>
--no-git-tag-version`. These version commands update the selected package and
workspace metadata as needed, without creating a second Git tag. Commit any
resulting lockfile change together with the manifest. If the version is already
correct (for example, the first `0.1.0` release), skip the version command and
commit.

Prepare the changelog on the checked-out release branch, using committed local
history and locally available tags:

```sh
pnpm release:prepare release/cli-v0.2.0
```

Fetch the complete history and all tags before disconnecting; a shallow checkout is
not supported. The command selects commits affecting the component since its
nearest reachable stable tag (or the entire history for a first release). SDK
notes also include OpenAPI changes. Conventional Commit types `feat`, `fix`,
`perf`, `deps`, `docs`, `refactor`, and `revert` are included; breaking commits
are included regardless of type. It reads committed changes only. It retains an
existing entry and reports when there are no releasable changes. Review and edit
the draft before committing it; no branch, PR, tag or publication is created.

After reviewing the draft, commit the changelog and push the branch:

```sh
git add apps/cli/CHANGELOG.md
git commit -m "docs(release): prepare cli 0.2.0 notes"
git flow release publish cli-v0.2.0
```

Open its PR to `main` manually. After source changes, review and update the
changelog again. For a CLI release containing only SDK changes,
use a `deps(cli)` commit touching the CLI manifest.

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
and fails with a message if it is unavailable. The CLI release workflow tests the
CLI tarball with a local packed SDK before staging it.

## Draft final release notes

The maintainer `imsergiobernal` (GitHub user ID `20087388`) drafts the final
notes in a personal Codex session. On every push to the release branch, the
preparation workflow refreshes the automatic draft and editorial status in the
PR using its scoped App token; it does not start Codex, merge or publish. Keep
the Codex environment private; repository prompts and markers do not independently
authenticate an agent, reviewer or approval.

1. Prepare and push the release branch locally and open its PR to `main`.
   Stabilize source and dependency changes on that same branch.
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

4. The next **Prepare release branch** run copies fresh editorial notes into the
   PR and displays the separate automatic draft. The synchronizer requires the
   candidate to be an ancestor of the release head and permits only the component
   changelog to differ from that candidate. It preserves existing PR text and
   replaces only its own notes block. Redraft after later source changes.
5. Review the changelog and PR, and run the checks locally:

   ```sh
   pnpm install --frozen-lockfile
   pnpm --filter '@imsergiobernal/vaia-cli...' --fail-if-no-match -r run build
   pnpm typecheck
   ```

The existing **Sync release notes** workflow remains available as a manual
fallback from `develop`; it only runs for `imsergiobernal` and checks both the
original actor and rerun actor. Its workflow file must exist on the default
branch before GitHub offers the manual trigger.

## Finish and publish

Merge the reviewed release PR into `main` using a merge commit. The **Sync
develop after release** workflow validates the merged release or hotfix PR,
then uses Git Flow Next to update `develop` from `main`. It uses the preparation
App's repository-scoped token, so the App must be permitted to push to `develop`.
It neither creates tags nor publishes packages. Wait for this workflow and the
resulting CI run before continuing. A concurrent update or a conflict fails the
workflow without force-pushing; resolve it and run the workflow again.

For a release merged before the workflow existed, or to retry after a failure,
run **Sync develop after release** manually from `develop` and provide the merged
release PR number. Manual dispatch is restricted to the maintainer. GitHub only
offers manual workflows present on the default branch. For manual conflict
resolution, fetch `main` and `develop`, update `develop` from `main`, review the
result, and push it before retrying.

Record the exact merge commit SHA shown by GitHub as `<PR_MERGE_COMMIT_SHA>`;
use that SHA rather than whichever commit `main` happens to point at later. Once
the synchronization succeeds, create and push the component tag:

```sh
git fetch origin --tags
git merge-base --is-ancestor <PR_MERGE_COMMIT_SHA> origin/main
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

Branch preparation and PR creation are manual. Tags stage packages for approval.
A tag must match its component's manifest, and its exact commit must already be
an ancestor of `origin/main`. Full history is fetched for that check. Older
integrated tags can still be validated when `main` has advanced.

Manual publication dispatch requires its workflow to exist on `main` and accepts
only an existing tag with the same validation as tag-triggered runs. Review the
notes before merging and pushing the tag. Avoid disposable test tags: a matching
tag integrated into `main` is a real staging trigger.

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
