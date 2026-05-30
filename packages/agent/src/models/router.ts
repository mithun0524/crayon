import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type ModelProvider = "openrouter" | "anthropic" | "openai" | "google";

export interface ModelConfig {
  model?: string;
  provider?: ModelProvider;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  googleApiKey?: string;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

function resolveProvider(config: ModelConfig, modelId: string): ModelProvider {
  if (config.provider) return config.provider as ModelProvider;
  if (config.googleApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    if (modelId.startsWith("gemini")) return "google";
  }
  if (config.openrouterApiKey || process.env.OPENROUTER_API_KEY) return "openrouter";
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("gemini")) return "google";
  if (modelId.startsWith("claude") || modelId.startsWith("anthropic")) return "anthropic";
  if (modelId.startsWith("gpt") || modelId.startsWith("o1") || modelId.startsWith("o3")) return "openai";
  return "anthropic";
}

function createOpenRouterClient(config: ModelConfig) {
  const apiKey = config.openrouterApiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for OpenRouter models");
  return createOpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    headers: {
      "HTTP-Referer": "https://github.com/crayon-agent/crayon",
      "X-Title": "Crayon Agent",
    },
  });
}

export function resolveModel(config: ModelConfig): LanguageModel {
  const modelId =
    config.model ??
    process.env.CRAYON_MODEL ??
    (resolveProvider(config, "") === "openrouter"
      ? DEFAULT_OPENROUTER_MODEL
      : "claude-sonnet-4-20250514");

  const provider = resolveProvider(config, modelId);

  switch (provider) {
    case "google": {
      const apiKey = config.googleApiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required for Gemini models");
      try {
        // @ts-ignore — @ai-sdk/google is an optional peer dependency
        const { createGoogleGenerativeAI } = require("@ai-sdk/google");
        return createGoogleGenerativeAI({ apiKey })(modelId);
      } catch {
        throw new Error("@ai-sdk/google is not installed. Run: pnpm add @ai-sdk/google");
      }
    }
    case "openrouter": {
      const openrouter = createOpenRouterClient(config);
      return openrouter(modelId);
    }
    case "openai": {
      const apiKey = config.openaiApiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is required for OpenAI models");
      return createOpenAI({ apiKey })(modelId);
    }
    case "anthropic":
    default: {
      const apiKey = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for Claude models");
      return createAnthropic({ apiKey })(modelId);
    }
  }
}

export function getPlanningModel(config: ModelConfig): LanguageModel {
  return resolveModel(config);
}

export function getExecutionModel(config: ModelConfig): LanguageModel {
  return resolveModel(config);
}
