#!/usr/bin/env node
import { execute } from "@oclif/core";
import { runMenu } from "../interactive/menu.js";

const args = process.argv.slice(2);

if (args.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
  await runMenu();
} else {
  if (args.length === 0) process.argv.push("help");
  await execute({ dir: import.meta.url });
}
