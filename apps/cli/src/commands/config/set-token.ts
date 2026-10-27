import { Command } from "@oclif/core";
import * as p from "@clack/prompts";
import { readStoredConfig, writeStoredConfig } from "../../config.js";

export default class ConfigSetToken extends Command {
  static override description = "Save an API token locally using a hidden prompt.";
  static override id = "config set-token";

  async run(): Promise<void> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      this.error("This command needs an interactive terminal. Set VAIA_API_TOKEN for CI/CD.");
    }

    const token = await p.password({ message: "API token" });
    if (p.isCancel(token)) this.exit(0);
    if (!token.trim()) this.error("The API token cannot be empty.");

    const config = await readStoredConfig();
    await writeStoredConfig({ ...config, token: token.trim() });
    this.log("API token saved locally. VAIA_API_TOKEN, when set, still takes precedence.");
  }
}
