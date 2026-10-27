# @vaia/cli

CLI for managing Vaia content through `@imsergiobernal/vaia-sdk`.

## Run locally

From the Vaia workspace root:

```sh
pnpm --filter @vaia/cli dev
```

Running without arguments in a terminal opens the interactive menu. In CI, use explicit commands:

Choose **Browse study sets** to load your active root study sets, then navigate between a selected
study set's flashcards and subsets. Selecting a subset opens the same menu for that subset; use
**Back to parent study set** to move up.

```sh
pnpm --filter @vaia/cli dev -- flashcards list 71434395
pnpm --filter @vaia/cli dev -- flashcards list 71434395 --cursor "<next-cursor>"
pnpm --filter @vaia/cli dev -- flashcards list 71434395 --full
pnpm --filter @vaia/cli dev -- flashcards list 71331662 --search "" --ratings bad,ok,good,perfect,unrated --visibility visible --created-by anybody --order anti-chronological --tag-ids 15280011,15280010 --quantity 20
pnpm --filter @vaia/cli dev -- flashcards create 71434395 --payload ./flashcard.json
pnpm --filter @vaia/cli dev -- flashcards update 71434395 1129037604 --payload ./flashcard.json
pnpm --filter @vaia/cli dev -- flashcards bulk-update 71331662 --payload ./flashcard-updates.json --concurrency 4
pnpm --filter @vaia/cli dev -- flashcards bulk-update 71331662 --payload ./flashcard-updates.json --dry-run
pnpm --filter @vaia/cli dev -- flashcards move 71451219 71451371 --flashcard-ids 1135003712
pnpm --filter @vaia/cli dev -- flashcards delete 71434395 1129037604
pnpm --filter @vaia/cli dev -- studysets subsets 71331662
pnpm --filter @vaia/cli dev -- studysets subsets 71331662 --full
pnpm --filter @vaia/cli dev -- studysets list
pnpm --filter @vaia/cli dev -- tags list 71331662
pnpm --filter @vaia/cli dev -- tags list 71331662 --content-filter flashcards
pnpm --filter @vaia/cli dev -- tags list 71331662 --full
pnpm --filter @vaia/cli dev -- tags create 71451202 --name prueba --colour -1
pnpm --filter @vaia/cli dev -- tags update 71451202 15310522 --name pruebaa --colour -1
pnpm --filter @vaia/cli dev -- tags delete 71451202 15310510
```

`studysets subsets <studyset-id>` lists the child study sets. Progress counters are included by
default; use `--no-include-progress` to omit them or `--full` to print every field returned by the
API.

`studysets list` lists root study sets with a compact summary. Use `--include-archived` to include
archived study sets or `--full` to print all fields.

`tags list` retrieves tags for a study set. `--content-filter flashcards` is optional; the observed
study set returned the same tags with and without it. `--full` prints the complete API response.
`tags create`, `tags update`, and `tags delete` manage study set tags. Create and update require a
name and colour identifier; deletion requires the study set and tag IDs. The create result includes
the server-assigned `tag_id` in its structured output so scripts can pass it to `tags update` or
`tags delete` without parsing a human message.

The list command returns a compact page summary with the total count and next/previous cursors.
Pass `--cursor` from the previous response to fetch another page. Use `--full` to print complete
flashcard records. Search, rating, visibility, creator, ordering, and page size can be controlled
with the matching flags shown by `flashcards list --help`.
Use `--tag-ids` with a comma-separated list to filter by one or more tag IDs.

Create and update require a JSON file matching the API's `FlashcardPayload`; `tags` is an array of
positive tag IDs, such as `[15311021]`. A successful update prints `requested_tag_ids`; the compact
flashcard list includes each card's current `tag_ids`. Verify the saved association by listing with
`--tag-ids <id>`. See
[`examples/flashcard.json`](./examples/flashcard.json). Delete sends the flashcard ID in the
request body by default.

## Authentication and API URL

Set `VAIA_API_TOKEN` for CI/CD, or save a token locally using `config set-token`. The local token
is entered through a hidden prompt. `VAIA_API_URL` overrides the saved URL; when neither is set,
the SDK's default URL is used.

```sh
pnpm --filter @vaia/cli dev -- config show
pnpm --filter @vaia/cli dev -- config set-url https://app.vaia.com
```

`config show` masks the token. Flashcard create, update, and delete make changes immediately; the
interactive menu asks for confirmation before deletion.

`flashcards bulk-update <studyset-id>` reads an `updates` array containing `flashcard_id` and a
complete `FlashcardPayload` for each card. It validates all entries before making changes, limits
parallel requests with `--concurrency` (1-16), retries rate limits and server errors, then reports
failed card IDs for a safe retry.
Pass `--dry-run` to validate the complete payload without sending updates.

`flashcards move <source-studyset-id> <destination-studyset-id> --flashcard-ids <id,...>` moves the
specified cards from the source study set (the path ID) to the destination. The command prints both
study set IDs, the moved card IDs, and the count as structured output for pipelines.
