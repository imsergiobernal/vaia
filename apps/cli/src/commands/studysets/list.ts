import { Command, Flags } from "@oclif/core";
import { writeCliError } from "../../flashcards.js";
import { listStudysets } from "../../studysets.js";

export default class StudysetsList extends Command {
  static override description = "List root study sets.";

  static override examples = [
    "<%= config.bin %> studysets list",
    "<%= config.bin %> studysets list --include-archived",
    "<%= config.bin %> studysets list --full",
  ];

  static override flags = {
    "include-archived": Flags.boolean({
      description: "Include archived study sets.",
      default: false,
    }),
    full: Flags.boolean({ description: "Print complete study set objects.", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StudysetsList);
    try {
      await listStudysets(flags["include-archived"], flags.full);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
