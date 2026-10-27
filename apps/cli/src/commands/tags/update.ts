import { Args, Command, Flags } from "@oclif/core";
import { updateTag, writeCliError } from "../../tags.js";

export default class TagsUpdate extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the study set." }),
    tagId: Args.integer({ name: "tag-id", required: true, description: "ID of the tag." }),
  };
  static override description = "Update a tag in a study set.";
  static override examples = ["<%= config.bin %> tags update 71451202 15310522 --name pruebaa --colour -1"];
  static override flags = {
    name: Flags.string({ required: true, description: "New tag name." }),
    colour: Flags.integer({ required: true, description: "Tag colour identifier." }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TagsUpdate);
    try {
      await updateTag(args.studysetId, args.tagId, flags.name, flags.colour);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
