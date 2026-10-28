import { Command } from "@oclif/core";
import { configFilePath, resolveConfig } from "../../config.js";

export default class ConfigShow extends Command {
  static override description = "Show the effective CLI configuration.";
  static override id = "config show";

  async run(): Promise<void> {
    const config = await resolveConfig();
    this.log(`API URL: ${config.baseUrl} (${config.baseUrlSource})`);
    this.log(`API token: ${config.token ? "configured (••••••)" : "not configured"}${config.tokenSource ? ` (${config.tokenSource})` : ""}`);
    this.log(`Config file: ${configFilePath}`);
  }
}
