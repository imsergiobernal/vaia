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

The configuration preserves the existing flow: releases start at `develop`,
hotfixes start at `main`, both finish into `main`, and `develop` is updated from
`main`. Both topic types create tags, with an empty additional tag prefix.
For example, finishing `release/cli-v0.2.0` creates `cli-v0.2.0`.

## Configure the preparation bot

Release Please `17.11.2` is pinned in the workspace lockfile. It creates and
updates a preparation PR against each pushed `release/*` or `hotfix/*` branch.
It does not create tags, GitHub Releases or package publications. Gitflow and the
tag-triggered publishers retain those responsibilities.

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
PR CI to run automatically on its preparation PRs.

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

Each push runs the **Prepare release PR** workflow, serializing runs for that
branch. The branch's component selects exactly one package; its version is
passed to Release Please as `releaseAs`, so conventional commits cannot silently
change the chosen target version. The PR updates the package's `CHANGELOG.md`
and maintains its target manifest version. The other component is not bumped.

Write Conventional Commits (`feat`, `fix`, `deps`, and breaking-change markers)
so the generated changelog describes the release. Release Please considers the
history after the latest reachable tag of the same component, or all available
component history for the first release. If there are no user-facing changes,
it reports that there is no preparation PR to create. For a CLI release that
only incorporates SDK dependency changes, describe that change in a `deps(cli)`
commit touching the CLI manifest; a version-only `chore` does not produce notes.

Keep the preparation PR open during stabilization. Corrections pushed to the
target branch update that same PR. Review its changelog and wait for its CI;
merge it manually as the last stabilization step. A push caused by that merge
does not create another preparation PR: the merged PR stays pending until the
Gitflow finish. Finish promptly without introducing further changes after the
preparation PR has been merged.

To rerun preparation locally, provide `GITHUB_REPOSITORY=imsergiobernal/vaia` and
`RELEASE_PLEASE_TOKEN` as an installation token from the same App, then run:

```sh
pnpm release:prepare release/cli-v0.2.0
```

This command only creates or updates a preparation PR; it never finishes the
branch or publishes anything. Do not put the token in the command line or commit
it in a configuration file.

Use the branch for corrections, documentation and package preparation. Continue
new features on `develop`. Do not bump the other component just to match versions.
An SDK release must still build and type-check the CLI and pass its smoke checks.
It does not publish the CLI.

The CLI package is published as `@imsergiobernal/vaia-cli` and exposes the `vaia`
command. Packing converts its workspace SDK dependency into the exact current
`@imsergiobernal/vaia-sdk` version. Publish that SDK version with its `sdk-vX.Y.Z`
tag before pushing the CLI tag; an already published SDK version can be reused.
The CLI publisher checks that dependency in GitHub Packages before publishing,
and fails with a message if it is unavailable. CI tests the CLI tarball with a
local packed SDK so development does not require publishing either package.

Before finishing, merge the preparation PR, update your local release branch
from its remote, wait for CI to pass and run the same checks locally:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm --filter '@imsergiobernal/vaia-cli...' --fail-if-no-match -r run build
pnpm --filter '@imsergiobernal/vaia-cli...' --fail-if-no-match -r run typecheck
```

## Finish and publish

Pull the merged preparation into the local release branch, finish with Gitflow,
then push `main` and `develop` before the individual tag:

```sh
git checkout release/cli-v0.2.0
git pull --ff-only origin release/cli-v0.2.0
git flow release finish cli-v0.2.0
git push origin main develop
git push origin refs/tags/cli-v0.2.0
```

Do not publish all tags together. The tag triggers only the matching workflow:

- `cli-v*`: checks the CLI version and `main` history, builds the CLI and SDK,
  installs and verifies the packed CLI outside the workspace, verifies the
  extracted production bundle, publishes the same CLI `.tgz` to GitHub Packages,
  and attaches both archives to a GitHub Release.
- `sdk-v*`: checks the SDK version and `main` history, verifies CLI compatibility,
  installs the packed SDK in an isolated consumer, checks its runtime and types,
  and publishes that same `.tgz` to GitHub Packages and GitHub Releases.

The SDK GitHub Release does not replace the CLI as the repository's latest
release. Publishing uses the workflow's `GITHUB_TOKEN`; only publication jobs
receive write permissions. GitHub Packages installation instructions are in
`apps/cli/README.md` and `packages/sdk/README.md`.

Both publishers require a single, nonempty `CHANGELOG.md` entry matching the
tagged version in the corresponding package. The validator exports that exact
entry to `release-notes.md`, which travels with the verified assets and becomes
the GitHub Release body. Missing, duplicate or empty entries fail before building
or publishing; notes from another component or version are never substituted.

Branch pushes validate and prepare PRs; only tags publish. CI checks release/hotfix
names and manifest versions on both PR head and target branches. A tag must match its own
component's manifest, and its exact commit must already be an ancestor of
`origin/main`. Full history is fetched for that check. Older integrated tags can
still be validated when `main` has advanced.

For the first release, push the setup changes, configure the App, and ensure the
preparation workflow, validator and locked dependency exist on the stabilization
branch. Manual publication dispatch requires its workflow to exist on `main` and
accepts only an existing tag with the same validation as tag-triggered runs.

Validate the setup in GitHub by publishing the first real stabilization branch.
Confirm that exactly one preparation PR targets that branch, its CI runs, an
additional fix updates the same PR, and merging the PR does not create a tag,
GitHub Release, package version or second preparation PR. Only then finish the
release with Gitflow and push the tag. Avoid disposable test tags: a matching
tag integrated into `main` is a real publication trigger.

## Hotfixes

Use the same procedure with `git flow hotfix start cli-v0.2.1` and
`git flow hotfix finish cli-v0.2.1` (or `sdk-v<version>`). Update the corresponding
manifest immediately after starting. Hotfixes begin at `main`, finish into `main`
and propagate into `develop`. They receive the same automatic preparation PR;
merge and pull it before finishing, then push both branches before the hotfix tag.
