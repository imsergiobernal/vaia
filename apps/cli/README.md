# @imsergiobernal/vaia-cli

CLI for browsing Vaia study sets and subsets, managing flashcards, and managing
tags through `@imsergiobernal/vaia-sdk`.

## Install from npm

Use Node.js 22 or newer. The CLI and its SDK dependency are public npm packages:

```sh
npm install --global @imsergiobernal/vaia-cli
vaia --help
vaia config set-token
vaia studysets list
```

Package installation does not require authentication. `vaia config set-token`
prompts for your **Vaia API token** to access Vaia content.

If you previously used GitHub Packages, update your user configuration and any
project `.npmrc` that overrides this scope:

```sh
npm config set @imsergiobernal:registry https://registry.npmjs.org --location=user
```

Each `cli-vX.Y.Z` release stages the verified npm tarball for manual approval
with 2FA and attaches it alongside the standalone production bundle to a draft
GitHub Release. Approve the package in npm, then publish the GitHub Release draft.
The CLI depends on the exact SDK version present when it is packed; that SDK
version must be approved and published before staging the CLI.
See [the release procedure](../../docs/releasing.md).

## Run locally

Use Node.js 22.12+ and pnpm 12.6.0. From the Vaia workspace root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @imsergiobernal/vaia-cli dev config set-token
pnpm --filter @imsergiobernal/vaia-cli dev
```

The build compiles the SDK before the CLI; the local CLI imports the SDK's
compiled output. `dev` runs once, so rerun it after editing CLI sources and rebuild
the SDK after editing SDK sources.

Running without arguments in an interactive terminal opens the menu. Choose
**Browse study sets** to load active root study sets, then navigate their
flashcards and subsets. The flashcard menu supports listing, creation, updates
and deletion. Use **Back to parent study set** to move up from a subset. Tag
management, bulk updates and moving flashcards are available through commands.

Without an interactive terminal, running without arguments displays help. For
scripts and CI, set `VAIA_API_TOKEN` and use explicit commands.

All examples below use the installed `vaia` executable. To run the same commands
locally, replace `vaia` with `pnpm --filter @imsergiobernal/vaia-cli dev`:

```sh
pnpm --filter @imsergiobernal/vaia-cli dev studysets list
pnpm --filter @imsergiobernal/vaia-cli dev flashcards list 71434395 --quantity 20
pnpm --filter @imsergiobernal/vaia-cli dev flashcards list --help
```

Pass arguments directly after `dev`; an extra `--` is forwarded to the CLI and
causes `command -- not found`. Replace example IDs with IDs from your account.
Relative `--payload` paths in these local commands resolve from `apps/cli`, where
pnpm runs the script. With installed `vaia`, they resolve from your current directory.

## Authentication and API URL

The CLI resolves configuration in this order:

| Setting | Environment variable | Saved configuration | Default |
| --- | --- | --- | --- |
| Vaia API token | `VAIA_API_TOKEN` | `vaia config set-token` | None; required for API commands. |
| API base URL | `VAIA_API_URL` | `vaia config set-url <url>` | `https://prod.studysmarter.de` |

Non-empty environment values take precedence over saved values. Save a token
through the hidden prompt in an interactive terminal, or set `VAIA_API_TOKEN` in
your environment for CI/CD. Inspect the effective configuration with:

```sh
vaia config set-token
vaia config show
```

`config show` masks the token and prints the configuration file path. To save an
API URL explicitly:

```sh
vaia config set-url https://prod.studysmarter.de
```

## Command reference

Arguments in angle brackets must be replaced with your values. All commands
support `--help`, for example `vaia flashcards list --help`.

| Command | Purpose and flags |
| --- | --- |
| `vaia config show` | Show the effective URL, masked token and config path. |
| `vaia config set-token` | Save a token through an interactive hidden prompt. |
| `vaia config set-url <url>` | Save the API base URL. |
| `vaia studysets list` | List root study sets; `--include-archived`, `--full`. |
| `vaia studysets subsets <studyset-id>` | List child study sets; `--no-include-progress`, `--full`. |
| `vaia flashcards list <studyset-id>` | List one page; filters, `--cursor`, `--quantity`, `--full` (see below). |
| `vaia flashcards create <studyset-id> --payload <file>` | Create a flashcard from a JSON file. |
| `vaia flashcards update <studyset-id> <flashcard-id> --payload <file>` | Update a flashcard with a complete JSON payload. |
| `vaia flashcards bulk-update <studyset-id> --payload <file>` | Update multiple cards; `--concurrency` (1–16, default 4), `--dry-run`. |
| `vaia flashcards move <source-studyset-id> <destination-studyset-id> --flashcard-ids <id,...>` | Move the specified flashcards. |
| `vaia flashcards delete <studyset-id> <flashcard-id>` | Delete a flashcard; optional `--payload <file>`. |
| `vaia tags list <studyset-id>` | List tags; `--content-filter flashcards`, `--full`. |
| `vaia tags create <studyset-id> --name <name> --colour <integer>` | Create a tag; both flags are required. |
| `vaia tags update <studyset-id> <tag-id> --name <name> --colour <integer>` | Update a tag; both flags are required. |
| `vaia tags delete <studyset-id> <tag-id>` | Delete a tag. |

Study set commands list existing sets and subsets. There are currently no
commands to create, update or delete study sets.

## Flashcards

### List and filter

```sh
vaia flashcards list 71434395
vaia flashcards list 71434395 --cursor "<next-cursor>"
vaia flashcards list 71434395 --full
vaia flashcards list 71434395 --search "Madrid" --ratings bad,unrated --tag-ids 15280011,15280010 --quantity 20
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--search <text>` | Empty string | Search text. |
| `--ratings <rating,...>` | `bad,ok,good,perfect,unrated` | Comma-separated ratings. |
| `--visibility <value>` | `visible` | Visibility filter sent to the API. |
| `--created-by <value>` | `anybody` | Creator filter sent to the API. |
| `--order <value>` | `anti-chronological` | Result ordering sent to the API. |
| `--tag-ids <id,...>` | Unset | Filter by positive tag IDs. |
| `--cursor <value>` | Unset | Fetch the page identified by an opaque cursor. |
| `--quantity <integer>` | `20` | Maximum cards per page; must be positive. |
| `--full` | Off | Print the complete API page, including full card records. |

The compact output contains the total `count`, `next_cursor`, `previous_cursor`
and card summaries, including `tag_ids`. Use the returned cursor and the same
filters to fetch another page. `--full` prints full data for the current page;
each invocation fetches one page.

### Create and update

Create a JSON file matching the API's `FlashcardPayload`; see
[`examples/flashcard.json`](./examples/flashcard.json). Both creation and updates
require `flashcard_image_ids`, `tags`, `question_html`, `answer_html`, `hint_html`
and `solution_html`. `tags` is an array of positive tag IDs, such as `[15311021]`.
Each question and answer block contains `text` and `is_correct`.

```sh
vaia flashcards create 71434395 --payload ./flashcard.json
vaia flashcards update 71434395 1129037604 --payload ./flashcard.json
```

`--payload` also has the short form `-f`. Updates require a complete payload.
A successful update prints `requested_tag_ids`; verify the saved association by
listing with `--tag-ids <id>`.

### Bulk update

Create `flashcard-updates.json` with an `updates` array. Each entry contains a
`flashcard_id` and a complete flashcard `payload`, for example:

```json
{
  "updates": [
    {
      "flashcard_id": 1129037604,
      "payload": {
        "flashcard_image_ids": [],
        "tags": [],
        "question_html": [{ "text": "<p>Capital of Spain?</p>", "is_correct": true }],
        "answer_html": [{ "text": "<p>Madrid</p>", "is_correct": true }],
        "hint_html": [],
        "solution_html": ""
      }
    }
  ]
}
```

```sh
vaia flashcards bulk-update 71434395 --payload ./flashcard-updates.json --dry-run
vaia flashcards bulk-update 71434395 --payload ./flashcard-updates.json --concurrency 4
```

The command validates all entries and rejects duplicate card IDs before making
requests. `--dry-run` only validates the file and arguments, requires no token,
and does not check server permissions or whether IDs exist. Actual updates use
bounded concurrency (1–16, default 4), retry network errors, HTTP 429 and HTTP 5xx
responses up to four times, and report failed card IDs. Any failed updates cause
a non-zero exit code.

### Move and delete

```sh
vaia flashcards move 71451219 71451371 --flashcard-ids 1135003712,1135003713
vaia flashcards delete 71434395 1129037604
```

Move takes the source study set first and the destination second. It prints both
study set IDs, the moved card IDs, and the count. Delete sends the flashcard ID
in the request body by default. An optional `--payload <file>` supplies a JSON
body; its `id`, if present, must match the command's flashcard ID.

Commands that create, update, move or delete data apply changes immediately,
except bulk updates with `--dry-run`. The interactive flashcard menu asks for
confirmation before deletion.

## Study sets and tags

```sh
vaia studysets list
vaia studysets list --include-archived --full
vaia studysets subsets 71331662
vaia studysets subsets 71331662 --no-include-progress
vaia tags list 71331662
vaia tags list 71331662 --content-filter flashcards --full
vaia tags create 71451202 --name "Review" --colour=-1
vaia tags update 71451202 15310522 --name "Reviewed" --colour=-1
vaia tags delete 71451202 15310522
```

`studysets list` lists root study sets with compact summaries. `--include-archived`
sends `is_archived=true` to the API; `--full` prints complete study set objects.
`studysets subsets` lists child study sets with progress counters by default;
`--no-include-progress` omits those counters and `--full` prints complete subset
objects.

`tags list` returns a compact tag summary by default; `--full` prints the complete
API response. The optional `--content-filter` only accepts `flashcards`.
Tag creation and updates require a name and integer colour identifier. Creation
prints the server-assigned `tag_id` so scripts can use it in later commands.

## Output

Data commands print structured **TOON** (Token-Oriented Object Notation) to
standard output, including when `--full` is used. `--full` changes the amount of
data returned. Use a TOON parser for scripts that consume this output. Help and
configuration commands print plain text; bulk update progress goes to standard
error. Failed data commands return a non-zero exit code.
