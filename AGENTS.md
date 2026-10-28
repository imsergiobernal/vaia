# AGENTS.md

## Project Overview

Vaia is an open-source toolkit for managing [Vaia](https://www.vaia.com) content (study sets, flashcards, tags) from the terminal or any Node.js application. It is a pnpm monorepo with three components:

| Path | Package | Role |
| --- | --- | --- |
| `apps/cli` | `@imsergiobernal/vaia-cli` | oclif-based CLI (interactive menu + scriptable commands). Published to the public npm registry; exposes the `vaia` executable. |
| `packages/sdk` | `@imsergiobernal/vaia-sdk` | Typed ESM HTTP client for the Vaia API (`openapi-fetch`). Published to the public npm registry with independent versioning. |
| `packages/openapi` | `@vaia/openapi` | OpenAPI 3.0 contract; single source of truth for SDK types. Workspace-only, never published. |

Key technologies: TypeScript (strict), Node.js 22+, ESM (`"type": "module"`), oclif, openapi-typescript, pnpm workspaces.

## Setup Commands

- Install dependencies: `pnpm install --frozen-lockfile`
- Build all packages (openapi → sdk → cli): `pnpm build`
- Type-check the whole workspace and scripts: `pnpm typecheck`
- Type-check release tooling: `pnpm typecheck:scripts`
- Regenerate SDK types from the OpenAPI contract: `pnpm generate`
- Validate a commit message file: `pnpm commitlint --edit <commit-message-file>`

Prerequisites: Node.js 22.12+ (required by commitlint) and pnpm 12.6.0 (pinned in `package.json` via `packageManager`/`devEngines`; corepack downloads it automatically).

## Development Workflow

- CLI dev mode (watch, interactive menu): `pnpm --filter @imsergiobernal/vaia-cli dev`
- CLI scriptable mode: `pnpm --filter @imsergiobernal/vaia-cli dev -- flashcards list <studyset-id>`
- All packages in parallel: `pnpm dev`
- Authentication for local runs: set `VAIA_API_TOKEN`, or use `vaia config set-token`. `VAIA_API_URL` overrides the saved/default API URL.

## Validation Instructions

- Run `pnpm build` and `pnpm typecheck` before pushing.
- Scripts run directly with `node --experimental-strip-types`, including on Node.js 22.12. Use explicit `.mts` relative imports and type-only imports for types; avoid syntax requiring TypeScript transformation.
- `pnpm typecheck:scripts` checks release tooling. The isolated `smoke-sdk.mts` and `sdk-consumer.mts` consumers are checked against the packed SDK by `.github/actions/verify-sdk`.
- Release workflows additionally verify the packed CLI and SDK outside the workspace.

## Code Style

- TypeScript strict mode everywhere; `target: ES2022`, `module/moduleResolution: NodeNext`. No source-code linter or formatter is configured — match existing code style manually.
- Scripts must not use explicit or inferred `any`, type assertions, non-null assertions, or type-check suppression comments. Use type annotations and runtime checks; keep parsed JSON as `unknown` until validated.
- ESM only: use explicit `.js` extensions in relative imports of compiled output where required by NodeNext resolution.
- **Never hand-edit generated files**: `packages/sdk/src/generated/schema.ts` (and the generated client) come from `pnpm generate`. After changing `packages/openapi/openapi.yaml`, run `pnpm generate`, then `pnpm build` and `pnpm typecheck`.
- Keep changes scoped per package; CLI depends on SDK via `workspace:*`.

## Build and Deployment

- Release workflows validate tags and versions, build and type-check the workspace, and verify packed SDK/CLI tarballs with `.github/actions/verify-sdk` and `.github/actions/verify-cli`.
- Before pushing, run `pnpm build` and `pnpm typecheck` locally.

## Commit Message Conventions

Use Conventional Commits with the root `.commitlintrc`, extending
`@commitlint/config-conventional`. Scopes are optional, lowercase, and restricted
to the following catalog. Multiple scopes use a comma: `fix(cli,sdk): ...`.

Write short descriptions in English, starting with an imperative verb in
lowercase (`add`, `fix`, `update`, or `remove`) and without a final period, e.g.,
`feat(cli): add tag filtering`. This is the project's writing convention;
Conventional Commits itself requires a short summary without prescribing a verb
mood. Commitlint does not check the language or verb mood.

| Scope | Responsibility |
| --- | --- |
| `cli` | CLI commands, interactive menu, configuration, and documentation. |
| `sdk` | HTTP client, SDK resources, and SDK documentation. |
| `openapi` | OpenAPI contract and type regeneration resulting from its changes. |
| `release` | Version preparation, validation, and publication automation, including Gitflow. |
| `workspace` | Monorepo structure, pnpm, shared configuration, and general CI. |
| `tooling` | Development tools, editor configuration, agent instructions, and commitlint. |

- Choose scopes by the purpose of the change: updating pnpm uses `workspace`, adding commitlint uses `tooling`, and fixing publication uses `release`.
- Use multiple scopes when a change affects several areas. Omit the scope for general changes when listing areas would not help.
- Documentation, tests, and dependencies use the commit type: `docs(cli)`, `test(release)`, and `deps(sdk)`. The allowed types are the conventional preset's types plus `deps`.
- Preparing a package version keeps the component scope: `chore(cli): prepare 0.2.0` or `chore(sdk): prepare 0.3.0`.
- Validate messages with `pnpm commitlint --edit <commit-message-file>`, or pipe a message into `pnpm commitlint`. This command validates messages without matching scopes to changed files.
- Apply the convention to new messages; do not rewrite existing history. Keep commitlint's default ignores for automatic merge and revert messages.
- See the official [commitlint rules](https://commitlint.js.org/reference/rules.html) for the scope enum, case, and delimiter configuration.

Accepted examples:

```text
feat(cli): add tag filtering
fix(cli,sdk): handle empty responses
feat(openapi,sdk): support tag filtering
docs: clarify installation
deps(cli): update SDK dependency
chore(tooling): configure commitlint
```

Rejected examples (unknown scopes, uppercase scopes, or a non-comma separator):

```text
feat(api): add an endpoint
fix(CLI): handle empty responses
fix(cli,backend): handle empty responses
fix(cli/sdk): handle empty responses
```

## Release Conventions

- CLI and SDK are versioned and published **independently**. Full procedure in [`docs/releasing.md`](docs/releasing.md).
- Branch format: `release/<component>-v<MAJOR.MINOR.PATCH>` or `hotfix/<component>-v<...>` where `<component>` is `cli` or `sdk`. The branch names the final target version (stable SemVer, no prerelease suffixes).
- Bump exactly one component's manifest per release branch: `pnpm --dir apps/cli version X.Y.Z --no-git-tag-version` (or `packages/sdk`). Never bump the other package "to match".
- Write **Conventional Commits** (`feat`, `fix`, `deps`, breaking-change markers) — generated changelogs depend on them. A CLI release that only incorporates SDK changes should use a `deps(cli)` commit touching the CLI manifest.
- Each release or hotfix has one manually opened PR from its own branch to `main`; generate the initial changelog locally with `pnpm release:prepare <branch>`. Review and merge the PR, tag its exact merge commit and merge `main` into `develop`. Do not run `git flow finish` after the PR merge.
- Tags (`cli-v*`, `sdk-v*`) stage packages in npm for manual approval with 2FA and create draft GitHub Releases, after verifying the tagged commit is an ancestor of `main`. Merging the release PR does not publish anything. Approve in npm before publishing the GitHub Release draft.
- When staging the CLI, its SDK dependency version must already be approved and published to npm (push and approve the matching `sdk-vX.Y.Z` tag first).

## Pull Request Guidelines

- Title format: Conventional Commit style (`feat(cli): ...`, `fix(sdk): ...`).
- Required checks before pushing/merging: `pnpm build` and `pnpm typecheck` both pass locally.
- Keep release branches for corrections and package preparation only; continue new features on `develop`.

## Additional Notes

- The root `lint` script (`pnpm -r lint`) currently matches no per-package linter — do not assume a lint step exists in packages.
- `scripts/prepare-release.mts`, `validate-release.mts`, and `release-notes.mts` are TypeScript ESM Node scripts that run via `node --experimental-strip-types` without a build step.
- The CLI's interactive menu uses `@clack/prompts`; scriptable commands live under `apps/cli/src/commands/**` with oclif conventions (`topicSeparator: " "`).
