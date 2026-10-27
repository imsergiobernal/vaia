import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import envPaths from "env-paths";
import { createClient, DEFAULT_BASE_URL, type VaiaClient } from "@vaia/sdk";

const configDirectory = envPaths("vaia").config;
export const configFilePath = path.join(configDirectory, "config.json");

export interface StoredConfig {
  baseUrl?: string;
  token?: string;
}

export interface ResolvedConfig {
  baseUrl: string;
  baseUrlSource: "environment" | "file" | "sdk default";
  token?: string;
  tokenSource?: "environment" | "file";
}

export async function readStoredConfig(): Promise<StoredConfig> {
  try {
    const rawConfig: unknown = JSON.parse(await readFile(configFilePath, "utf8"));
    if (!isStoredConfig(rawConfig)) {
      throw new Error("The config file must contain optional string fields 'baseUrl' and 'token'.");
    }

    return rawConfig;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return {};
    if (error instanceof SyntaxError) {
      throw new Error(`Could not parse ${configFilePath}: ${error.message}`);
    }

    throw error;
  }
}

export async function writeStoredConfig(config: StoredConfig): Promise<void> {
  await mkdir(configDirectory, { recursive: true, mode: 0o700 });
  await writeFile(configFilePath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function resolveConfig(): Promise<ResolvedConfig> {
  const storedConfig = await readStoredConfig();
  const envBaseUrl = process.env.VAIA_API_URL?.trim();
  const envToken = process.env.VAIA_API_TOKEN?.trim();

  const baseUrl = envBaseUrl || storedConfig.baseUrl || DEFAULT_BASE_URL;
  const baseUrlSource = envBaseUrl
    ? "environment"
    : storedConfig.baseUrl
      ? "file"
      : "sdk default";
  const token = envToken || storedConfig.token;
  const tokenSource = envToken ? "environment" : storedConfig.token ? "file" : undefined;

  return { baseUrl, baseUrlSource, token, tokenSource };
}

export async function createConfiguredClient(): Promise<VaiaClient> {
  const config = await resolveConfig();
  return createClient({ baseUrl: config.baseUrl, token: config.token });
}

export function isStoredConfig(value: unknown): value is StoredConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  return (
    (config.baseUrl === undefined || typeof config.baseUrl === "string") &&
    (config.token === undefined || typeof config.token === "string")
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
