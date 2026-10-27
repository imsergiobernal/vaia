import { Args, Command, Flags } from "@oclif/core";
import { listTags, writeCliError } from "../../tags.js";

export default class TagsList extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the study set." }),
  };
  static override description = "List tags belonging to a study set.";
  static override examples = [
    "<%= config.bin %> tags list 71331662",
    '<%= config.bin %> tags list 71331662 --content-filter flashcards',
    "<%= config.bin %> tags list 71331662 --full",
  ];
  static override flags = {
    "content-filter": Flags.string({
      description: "Filter by content type.",
      options: ["flashcards"],
    }),
    full: Flags.boolean({ description: "Print the complete API response.", default: false }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TagsList);
    try {
      const contentFilter = flags["content-filter"] === "flashcards" ? "flashcards" : undefined;
      await listTags(args.studysetId, contentFilter, flags.full);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
