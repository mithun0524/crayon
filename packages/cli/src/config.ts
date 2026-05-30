import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface CrayonConfig {
  defaultModel?: string;
  provider?: "openrouter" | "anthropic" | "openai" | "google";
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  googleApiKey?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".crayon");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export async function loadConfig(): Promise<CrayonConfig> {
  const config: CrayonConfig = {
    defaultModel: process.env.CRAYON_MODEL,
    provider: process.env.CRAYON_PROVIDER as CrayonConfig["provider"] | undefined,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    googleApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  };

  if (existsSync(CONFIG_PATH)) {
    try {
      const file = JSON.parse(await readFile(CONFIG_PATH, "utf-8")) as CrayonConfig;
      return {
        defaultModel: config.defaultModel ?? file.defaultModel,
        provider: config.provider ?? file.provider,
        anthropicApiKey: config.anthropicApiKey ?? file.anthropicApiKey,
        openaiApiKey: config.openaiApiKey ?? file.openaiApiKey,
        openrouterApiKey: config.openrouterApiKey ?? file.openrouterApiKey,
        googleApiKey: config.googleApiKey ?? file.googleApiKey,
      };
    } catch {
      // use env only
    }
  }

  return config;
}

export async function saveConfig(config: CrayonConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function hasApiKey(config: CrayonConfig): boolean {
  return !!(config.anthropicApiKey || config.openaiApiKey || config.openrouterApiKey || config.googleApiKey);
}
