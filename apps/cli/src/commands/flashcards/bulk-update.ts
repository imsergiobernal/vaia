import { Args, Command, Flags } from "@oclif/core";
import { bulkUpdateFlashcards } from "../../bulk-updates.js";
import { writeCliError } from "../../flashcards.js";

export default class FlashcardsBulkUpdate extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the study set." }),
  };
  static override description = "Update multiple flashcards from one JSON payload file.";
  static override examples = [
    '<%= config.bin %> flashcards bulk-update 71331662 --payload ./flashcard-updates.json --concurrency 4',
    '<%= config.bin %> flashcards bulk-update 71331662 --payload ./flashcard-updates.json --dry-run',
  ];
  static override flags = {
    payload: Flags.string({ char: "f", required: true, description: "Path to bulk update JSON file." }),
    concurrency: Flags.integer({ default: 4, description: "Maximum parallel updates (1-16)." }),
    "dry-run": Flags.boolean({ default: false, description: "Validate the complete payload without making changes." }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(FlashcardsBulkUpdate);
    try {
      await bulkUpdateFlashcards(args.studysetId, flags.payload, flags.concurrency, flags["dry-run"]);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
