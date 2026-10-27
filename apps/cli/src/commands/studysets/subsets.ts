import { Args, Command, Flags } from "@oclif/core";
import { writeCliError } from "../../flashcards.js";
import { listSubsets } from "../../studysets.js";

export default class StudysetsSubsets extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the parent study set." }),
  };

  static override description = "List subsets belonging to a study set.";

  static override examples = [
    "<%= config.bin %> studysets subsets 71331662",
    "<%= config.bin %> studysets subsets 71331662 --no-include-progress",
    "<%= config.bin %> studysets subsets 71331662 --full",
  ];

  static override flags = {
    "include-progress": Flags.boolean({
      description: "Include flashcard and learning progress counters.",
      default: true,
      allowNo: true,
    }),
    full: Flags.boolean({ description: "Print complete subset objects.", default: false }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(StudysetsSubsets);
    try {
      await listSubsets(args.studysetId, flags["include-progress"], flags.full);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
