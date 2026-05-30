import type { CoreMessage } from "ai";
import type { CodeIndexer, RepoIntelligence } from "@crayon/indexer";
import type { z } from "zod";
import type { McpServerConfig } from "./tools/mcp.js";

export type AgentEvent =
  | { type: "thinking"; content: string }
  | { type: "text"; content: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "plan"; steps: string[] }
  | { type: "edit"; path: string; diff: string }
  | { type: "eval"; passed: boolean; output: string }
  | { type: "done"; summary: string }
  | { type: "error"; message: string };

export interface AgentConfig {
  workspaceRoot: string;
  model?: string;
  provider?: "openrouter" | "anthropic" | "openai";
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  maxSteps?: number;
  maxEvalRetries?: number;
  onEvent?: (event: AgentEvent) => void;
  approveCommand?: (command: string) => Promise<boolean>;
  approveEdit?: (path: string, newContent: string) => Promise<boolean>;
  mcpServers?: McpServerConfig[];
}

export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: T;
  execute: (args: z.infer<T>) => Promise<unknown>;
}

export interface ToolContext {
  workspaceRoot: string;
  indexer: CodeIndexer;
  onEvent?: (event: AgentEvent) => void;
  approveCommand?: (command: string) => Promise<boolean>;
  approveEdit?: (path: string, newContent: string) => Promise<boolean>;
}

export interface AgentSession {
  id: string;
  task: string;
  messages: CoreMessage[];
  plan: string[];
  startedAt: string;
}

export interface AgentResult {
  success: boolean;
  summary: string;
  steps: number;
  edits: string[];
}

export type { CoreMessage, RepoIntelligence };
