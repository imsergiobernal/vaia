import { Args, Command, Flags } from "@oclif/core";
import { listFlashcards, writeCliError } from "../../flashcards.js";

export default class FlashcardsList extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the study set." }),
  };
  static override description = "List a page of flashcards from a study set.";
  static override examples = [
    '<%= config.bin %> flashcards list 71434395',
    '<%= config.bin %> flashcards list 71434395 --quantity 20 --cursor "<next-cursor>"',
    '<%= config.bin %> flashcards list 71331662 --tag-ids 15280011,15280010',
    '<%= config.bin %> flashcards list 71434395 --full',
  ];
  static override flags = {
    search: Flags.string({ description: "Search text.", default: "" }),
    ratings: Flags.string({ description: "Comma-separated ratings.", default: "bad,ok,good,perfect,unrated" }),
    visibility: Flags.string({ description: "Visibility filter.", default: "visible" }),
    "created-by": Flags.string({ description: "Creator filter.", default: "anybody" }),
    order: Flags.string({ description: "Result ordering.", default: "anti-chronological" }),
    "tag-ids": Flags.string({ description: "Comma-separated tag IDs." }),
    cursor: Flags.string({ description: "Opaque cursor from the previous page." }),
    quantity: Flags.integer({ description: "Maximum number of flashcards in this page.", default: 20 }),
    full: Flags.boolean({ description: "Include full flashcard data instead of the compact summary.", default: false }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(FlashcardsList);
    try {
      await listFlashcards(args.studysetId, {
        search: flags.search,
        ratings: flags.ratings.split(",").map((rating) => rating.trim()).filter(Boolean),
        visibility: flags.visibility,
        createdBy: flags["created-by"],
        order: flags.order,
        tagIds: flags["tag-ids"]?.split(",").map((tagId) => Number(tagId.trim())),
        cursor: flags.cursor,
        quantity: flags.quantity,
      }, flags.full);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
