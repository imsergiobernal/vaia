import { Args, Command, Flags } from "@oclif/core";
import { encode } from "@toon-format/toon";
import { ApiError, createClient, NetworkError } from "@imsergiobernal/vaia-sdk";
import { resolveConfig } from "../../config.js";
import { CliActionError, writeCliError } from "../../flashcards.js";

export default class FlashcardsMove extends Command {
  static override args = {
    sourceStudysetId: Args.integer({ name: "source-studyset-id", required: true, description: "Study set containing the flashcards." }),
    destinationStudysetId: Args.integer({ name: "destination-studyset-id", required: true, description: "Study set to receive the flashcards." }),
  };
  static override description = "Move flashcards from one study set to another.";
  static override examples = [
    '<%= config.bin %> flashcards move 71451219 71451371 --flashcard-ids 1135003712',
    '<%= config.bin %> flashcards move 71451219 71451371 --flashcard-ids 1135003712,1135003713',
  ];
  static override flags = {
    "flashcard-ids": Flags.string({ required: true, description: "Comma-separated IDs of flashcards in the source study set." }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(FlashcardsMove);
    try {
      await moveFlashcards(args.sourceStudysetId, args.destinationStudysetId, flags["flashcard-ids"]);
    } catch (error) {
      writeCliError(normalizeMoveError(error));
      process.exitCode = 1;
    }
  }
}

async function moveFlashcards(sourceStudysetId: number, destinationStudysetId: number, flashcardIdsInput: string): Promise<void> {
  assertPositiveId(sourceStudysetId, "source-studyset-id");
  assertPositiveId(destinationStudysetId, "destination-studyset-id");
  if (sourceStudysetId === destinationStudysetId) {
    throw new CliActionError("invalid_argument", "Source and destination study sets must be different.", "Pass two different study set IDs.");
  }

  const flashcardIds = flashcardIdsInput.split(",").map((value) => Number(value.trim()));
  if (flashcardIds.length === 0 || flashcardIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new CliActionError("invalid_argument", "flashcard-ids must contain comma-separated positive safe integers.", "Pass IDs such as --flashcard-ids 123,456.");
  }
  if (new Set(flashcardIds).size !== flashcardIds.length) {
    throw new CliActionError("invalid_argument", "flashcard-ids must not contain duplicates.", "Pass each flashcard ID once.");
  }

  const config = await resolveConfig();
  if (!config.token) {
    throw new CliActionError("missing_token", "An API token is required to move flashcards.", "Set VAIA_API_TOKEN or run `vaia config set-token`.");
  }

  const client = createClient({ baseUrl: config.baseUrl, token: config.token });
  await client.flashcards.move(sourceStudysetId, {
    destination_studyset_id: destinationStudysetId,
    flashcard_ids: flashcardIds,
  });
  console.log(encode({
    status: "moved",
    source_studyset_id: sourceStudysetId,
    destination_studyset_id: destinationStudysetId,
    count: flashcardIds.length,
    flashcard_ids: flashcardIds,
  }));
}

function assertPositiveId(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CliActionError("invalid_argument", `${name} must be a positive safe integer.`, "Pass a positive numeric identifier.");
  }
}

function normalizeMoveError(error: unknown): CliActionError {
  if (error instanceof CliActionError) return error;
  if (error instanceof ApiError) {
    const suggestion = error.status === 401 || error.status === 403
      ? "Check the configured token with `vaia config show` and confirm it has permission."
      : "Verify both study set IDs and every flashcard ID, then retry.";
    return new CliActionError("api_error", `The API rejected the flashcard move (HTTP ${error.status}).`, suggestion);
  }
  if (error instanceof NetworkError) {
    return new CliActionError("network_error", "The API request could not be completed.", "Check the network and API URL with `vaia config show`.");
  }
  return new CliActionError("unexpected_error", "The flashcard move could not be completed.", "Check the CLI configuration and retry.");
}
