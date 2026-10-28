import { Args, Command } from "@oclif/core";
import { readStoredConfig, writeStoredConfig } from "../../config.js";

export default class ConfigSetUrl extends Command {
  static override args = {
    url: Args.url({ required: true, description: "API base URL." }),
  };

  static override description = "Save the API base URL in the local config file.";
  static override id = "config set-url";

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSetUrl);
    const config = await readStoredConfig();
    await writeStoredConfig({ ...config, baseUrl: args.url.toString().replace(/\/+$/, "") });
    this.log("API URL saved. VAIA_API_URL, when set, still takes precedence.");
  }
}
