import { Args, Command, Flags } from "@oclif/core";
import { deleteFlashcard, writeCliError } from "../../flashcards.js";

export default class FlashcardsDelete extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the study set." }),
    flashcardId: Args.integer({ name: "flashcard-id", required: true, description: "ID of the flashcard." }),
  };
  static override description = "Delete a flashcard from a study set.";
  static override examples = [
    '<%= config.bin %> flashcards delete 71434395 1129037604',
    '<%= config.bin %> flashcards delete 71434395 1129037604 --payload ./delete.json',
  ];
  static override flags = {
    payload: Flags.string({ char: "f", required: false, description: "Optional DeleteFlashcardPayload JSON file." }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(FlashcardsDelete);
    try {
      await deleteFlashcard(args.studysetId, args.flashcardId, flags.payload);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
