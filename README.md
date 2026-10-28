# Vaia

**Open-source toolkit for managing your [Vaia](https://www.vaia.com) content — study sets, flashcards and tags — from the terminal or any Node.js application.**

Use the interactive and scriptable CLI from your terminal, or the typed ESM SDK
from your Node.js application. Both are published to the public npm registry.

[![Node.js](https://img.shields.io/badge/node-%3E%3D22-blue?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-12.6.0-f9b14e?logo=pnpm&logoColor=black)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-lightgrey.svg)](#license)

## Table of contents

- [Quick start](#quick-start)
- [Features](#features)
- [Packages](#packages)
- [Contributing](#contributing)
- [License](#license)

## Quick start

### CLI (from npm)

Use Node.js 22 or newer.

Install the CLI directly from npm; package installation does not require authentication:

```sh
npm install --global @imsergiobernal/vaia-cli
vaia config set-token
vaia
vaia studysets list
vaia flashcards list 71434395
```

`config set-token` prompts for your **Vaia API token**. Replace the example study set ID with one
returned by `vaia studysets list`.

To run the CLI from a checkout, follow the [local development guide](CONTRIBUTING.md#development).

Full command reference, flags and examples live in [`apps/cli/README.md`](apps/cli/README.md).

### SDK (from npm)

```sh
npm install @imsergiobernal/vaia-sdk
```

```js
import { createClient } from '@imsergiobernal/vaia-sdk';

// Set VAIA_API_TOKEN in the environment before running this example.
const client = createClient({ token: process.env.VAIA_API_TOKEN });
const studysets = await client.studysets.list();
```

If you previously installed from GitHub Packages, update your user configuration
so both packages resolve from npm:

```sh
npm config set @imsergiobernal:registry https://registry.npmjs.org --location=user
```

Update any project `.npmrc` that overrides this scope as well.

### Authentication

Both components authenticate with a Vaia API token. The CLI reads `VAIA_API_TOKEN`
or a token saved by `vaia config set-token` through a hidden prompt. Its
`VAIA_API_URL` environment variable overrides the saved URL; the default is
`https://prod.studysmarter.de`.

The SDK takes `token` and optional `baseUrl` options in `createClient()`. It does
not read environment variables or the CLI's saved configuration automatically;
pass those values explicitly in your application.

## Features

- **Interactive menu** — after configuring a Vaia token, browse study sets and subsets, and list, create, update or delete flashcards. Running the CLI without arguments in an interactive terminal opens it; otherwise it displays help.
- **Scriptable commands** — list study sets and subsets, manage flashcards and tags, and inspect or set configuration (`flashcards`, `studysets`, `tags`, `config`). Data commands return structured TOON output; `config set-token` requires an interactive terminal.
- **Bulk operations** — validate-first bulk updates with bounded concurrency, automatic retries on rate limits and server errors, `--dry-run` mode, and failed-ID reporting for safe re-runs.
- **Cursor pagination & filtering** — page through results with cursors; filter by search text, ratings, visibility, creator, ordering, quantity and tag IDs.
- **Typed SDK** — request/response schema types generated from the OpenAPI contract via `openapi-typescript`, with resource methods for flashcards, study sets and tags.

## Packages

| Path | Package | Description |
| --- | --- | --- |
| [`apps/cli`](apps/cli/) | `@imsergiobernal/vaia-cli` | Interactive and scriptable CLI; exposes the `vaia` executable. |
| [`packages/sdk`](packages/sdk/) | `@imsergiobernal/vaia-sdk` | Typed ESM HTTP client for the Vaia API. |
| [`packages/openapi`](packages/openapi/) | `@vaia/openapi` | OpenAPI contract that drives SDK type generation; workspace-only. |

CLI and SDK are versioned and published independently. The publication procedure
requires manual approval with 2FA in npm after each tag-triggered staging run,
followed by publishing the GitHub Release draft. See the
[release and hotfix guide](docs/releasing.md).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup,
development scripts, repository structure, commit conventions and pull request
checks.

## License

Released under the [ISC License](https://opensource.org/licenses/ISC). See per-package manifests for details.
