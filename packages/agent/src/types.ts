import type { CoreMessage } from "ai";
import type { CodeIndexer, RepoIntelligence } from "crayon-indexer";
import type { z } from "zod";
import type { McpServerConfig } from "./tools/mcp.js";
import type { FileStateCache } from "./context/fileState.js";

export type AgentEvent =
  | { type: "thinking"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "reasoning_delta"; content: string }
  | { type: "text"; content: string }
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "plan"; steps: string[] }
  | { type: "edit"; path: string; diff: string }
  | { type: "eval"; passed: boolean; output: string }
  | { type: "done"; summary: string }
  | { type: "error"; message: string }
  | { type: "usage"; promptTokens: number; completionTokens: number; totalTokens: number }
  | { type: "ask_user"; question: string };

export type PermissionMode = "ask" | "auto-edit" | "plan" | "auto" | "bypass";

export interface AgentConfig {
  workspaceRoot: string;
  model?: string;
  provider?: "openrouter" | "anthropic" | "openai" | "google";
  anthropicApiKey?: string;
  openaiApiKey?: string;
  openrouterApiKey?: string;
  googleApiKey?: string;
  maxSteps?: number;
  maxEvalRetries?: number;
  permissionMode?: PermissionMode;
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
  permissionMode?: PermissionMode;
  onEvent?: (event: AgentEvent) => void;
  approveCommand?: (command: string) => Promise<boolean>;
  approveEdit?: (path: string, newContent: string) => Promise<boolean>;
  fileState?: FileStateCache;
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
