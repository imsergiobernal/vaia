import { Args, Command, Flags } from "@oclif/core";
import { createTag, writeCliError } from "../../tags.js";

export default class TagsCreate extends Command {
  static override args = {
    studysetId: Args.integer({ name: "studyset-id", required: true, description: "ID of the study set." }),
  };
  static override description = "Create a tag in a study set.";
  static override examples = ["<%= config.bin %> tags create 71451202 --name prueba --colour -1"];
  static override flags = {
    name: Flags.string({ required: true, description: "Tag name." }),
    colour: Flags.integer({ required: true, description: "Tag colour identifier." }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TagsCreate);
    try {
      await createTag(args.studysetId, flags.name, flags.colour);
    } catch (error) {
      writeCliError(error);
      process.exitCode = 1;
    }
  }
}
