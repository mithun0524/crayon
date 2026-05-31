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
  permissionMode?: "ask" | "auto-edit" | "plan" | "auto" | "bypass";
  mcpServers?: any[];
  disableTelemetry?: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), ".crayon");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

async function loadMcpServers(): Promise<any[] | undefined> {
  try {
    const mcpPath = path.join(CONFIG_DIR, "mcp.json");
    if (existsSync(mcpPath)) {
      const mcpFile = JSON.parse(await readFile(mcpPath, "utf-8"));
      if (mcpFile.mcpServers) {
        return Object.entries(mcpFile.mcpServers).map(([name, conf]: [string, any]) => ({
          name,
          command: conf.command,
          args: conf.args,
          env: conf.env,
        }));
      }
    }
  } catch {}
  return undefined;
}

export async function loadConfig(): Promise<CrayonConfig> {
  const config: CrayonConfig = {
    defaultModel: process.env.CRAYON_MODEL,
    provider: process.env.CRAYON_PROVIDER as CrayonConfig["provider"] | undefined,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    googleApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    disableTelemetry: process.env.CRAYON_DISABLE_TELEMETRY === "1" || process.env.CRAYON_DISABLE_TELEMETRY === "true",
  };

  if (existsSync(CONFIG_PATH)) {
    try {
      const file = JSON.parse(await readFile(CONFIG_PATH, "utf-8")) as CrayonConfig;
      const merged: CrayonConfig = {
        defaultModel: config.defaultModel ?? file.defaultModel,
        provider: config.provider ?? file.provider,
        anthropicApiKey: config.anthropicApiKey ?? file.anthropicApiKey,
        openaiApiKey: config.openaiApiKey ?? file.openaiApiKey,
        openrouterApiKey: config.openrouterApiKey ?? file.openrouterApiKey,
        googleApiKey: config.googleApiKey ?? file.googleApiKey,
        permissionMode: config.permissionMode ?? file.permissionMode,
        disableTelemetry: config.disableTelemetry ?? file.disableTelemetry,
      };
      merged.mcpServers = await loadMcpServers();
      return merged;
    } catch {
      // use env only
    }
  }

  config.mcpServers = await loadMcpServers();
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
