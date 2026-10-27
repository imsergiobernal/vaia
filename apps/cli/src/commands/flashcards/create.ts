import { Args, Command, Flags } from "@oclif/core";
import { createFlashcard, writeCliError } from "../../flashcards.js";

export default class FlashcardsCreate extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the study set." }),
  };
  static override description = "Create a flashcard from a JSON payload file.";
  static override examples = [
    '<%= config.bin %> flashcards create 71434395 --payload ./flashcard.json',
  ];
  static override flags = {
    payload: Flags.string({ char: "f", required: true, description: "Path to a FlashcardPayload JSON file." }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(FlashcardsCreate);
    try {
      await createFlashcard(args.studysetId, flags.payload);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
