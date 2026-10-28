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
target branch update that same PR. After the final preparation run, use
[Draft final release notes](#draft-final-release-notes) to consolidate the notes,
review its changelog and wait for CI. Merge it manually as the last stabilization
step. A push caused by that merge
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
tag and approve it in npm before pushing the CLI tag; an already published SDK
version can be reused.
The CLI publisher checks that dependency in npm before publishing,
and fails with a message if it is unavailable. CI tests the CLI tarball with a
local packed SDK so development does not require publishing either package.

## Draft final release notes

Release notes are consolidated in a personal Codex session using the connected
Vaia repository. GitHub Actions only synchronizes the committed result into the
preparation PR; it never starts Codex or receives a Codex session or API key.

The sole maintainer for this flow is **imsergiobernal**, pinned to GitHub user ID
**20087388**. The **Sync release notes** workflow accepts manual runs from
`main` only in `imsergiobernal/vaia`, and checks both the original actor and the
person requesting a rerun. The script repeats these checks before accessing the
GitHub API. Its temporary GitHub token can read repository content and update PR
metadata; this job does not change repository files, merge, tag or publish.

### Personal Codex access

Connect the repository through ChatGPT Codex Connector in your personal Codex
account and keep its environment private. Start drafting from your signed-in
Codex session rather than a public PR comment. No public comment command, bot
mention, issue event, or automatic PR event starts Codex in this flow.

Repository workflow checks cannot control mentions sent directly to the external
Codex GitHub integration. They are not a global owner allowlist for that app.
For this personal-only setup, leave shared environments and repository-wide
Codex review automation outside this flow; inspect those settings separately if
already enabled. Repository prompts and provenance comments guide drafting and
check freshness; they do not authenticate a Codex user. See
[Codex authentication](https://learn.chatgpt.com/docs/auth) and the
[GitHub integration documentation](https://learn.chatgpt.com/docs/third-party/github).

### Draft, review and synchronize

1. Wait for the final **Prepare release PR** run to complete and leave its
   preparation PR open. Source and dependency changes belong on the stabilization
   branch; the preparation PR must contain only its manifest and changelog work.
2. From your personal Codex session, provide the existing preparation PR and ask
   Codex to follow [.github/codex/prompts/release-notes.md](../.github/codex/prompts/release-notes.md).
   For example:

   ```text
   Consolidate release notes for preparation PR #<number> in imsergiobernal/vaia.
   Follow .github/codex/prompts/release-notes.md. Update only the target version's
   changelog entry on the existing preparation branch and report evidence and
   uncertainties for my review.
   ```

3. Review the changed changelog entry and the evidence in the personal task.
   Codex compares the final stabilization candidate with the nearest reachable
   stable tag of the selected component, or the empty tree for a first release.
   Intermediate iterations, abandoned changes and internal housekeeping should
   be consolidated or omitted. Verify omissions and incompatible changes.
4. Ensure the notes commit is on the existing preparation branch. If your Codex
   session provides a patch instead of pushing it, apply that patch to the same
   branch. Preserve the original version heading, date, comparison link and all
   older version entries.
5. In **Actions > Sync release notes > Run workflow**, select `main` and provide
   the preparation PR number. The workflow must already exist on `main` before
   GitHub offers its manual trigger. Other actors are rejected before checkout.
6. Check that the PR body matches the changelog, wait for CI on the notes commit,
   then merge the preparation PR and continue with Gitflow finish below.

The target changelog entry must include exactly one freshness marker. The agent
instructions describe its format; use actual values, including JSON `null` for
`previous_tag` on a first release:

```html
<!-- vaia-release-notes {"component":"cli","version":"0.2.0","candidate":"<40-character-stabilization-sha>","previous_tag":"cli-v0.1.0"} -->
```

Synchronization validates the marker against the live candidate, component,
version and previous tag, copies exactly that version entry into the body, and
preserves Release Please's header/footer. It refuses stale drafts, unexpected
preparation changes or a PR changed during synchronization. Rerunning an unchanged
synchronization does not make another edit.

New stabilization pushes, or rerunning **Prepare release PR**, regenerate the
automatic notes. Draft and review them again before synchronizing. The body
records the notes commit and candidate SHA; publication continues to extract the
same version entry from the committed changelog.

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

Validate the setup in GitHub by publishing the first real stabilization branch.
Confirm that exactly one preparation PR targets that branch, its CI runs, an
additional fix updates the same PR, and merging the PR does not create a tag,
GitHub Release, package version or second preparation PR. Only then finish the
release with Gitflow and push the tag. Avoid disposable test tags: a matching
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

Use the same procedure with `git flow hotfix start cli-v0.2.1` and
`git flow hotfix finish cli-v0.2.1` (or `sdk-v<version>`). Update the corresponding
manifest immediately after starting. Hotfixes begin at `main`, finish into `main`
and propagate into `develop`. They receive the same automatic preparation PR;
merge and pull it before finishing, then push both branches before the hotfix tag.
