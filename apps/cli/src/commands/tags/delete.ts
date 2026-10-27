import { Args, Command } from "@oclif/core";
import { deleteTag, writeCliError } from "../../tags.js";

export default class TagsDelete extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the study set." }),
    tagId: Args.integer({ name: "tag-id", required: true, description: "ID of the tag." }),
  };
  static override description = "Delete a tag from a study set.";
  static override examples = ["<%= config.bin %> tags delete 71451202 15310510"];

  async run(): Promise<void> {
    const { args } = await this.parse(TagsDelete);
    try {
      await deleteTag(args.studysetId, args.tagId);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
