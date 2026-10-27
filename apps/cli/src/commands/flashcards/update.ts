import { Args, Command, Flags } from "@oclif/core";
import { updateFlashcard, writeCliError } from "../../flashcards.js";

export default class FlashcardsUpdate extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the study set." }),
    flashcardId: Args.integer({ name: "flashcard-id", required: true, description: "ID of the flashcard." }),
  };
  static override description = "Replace a flashcard using a JSON payload file.";
  static override examples = [
    '<%= config.bin %> flashcards update 71434395 1129037604 --payload ./flashcard.json',
  ];
  static override flags = {
    payload: Flags.string({ char: "f", required: true, description: "Path to a FlashcardPayload JSON file." }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(FlashcardsUpdate);
    try {
      await updateFlashcard(args.studysetId, args.flashcardId, flags.payload);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
