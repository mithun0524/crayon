import type { CoreMessage } from "ai";
import type { CodeIndexer, RepoIntelligence } from "crayon-indexer";
import type { z } from "zod";
import type { McpServerConfig } from "./tools/mcp.js";
import type { FileStateCache } from "./context/fileState.js";
import type { TransactionManager } from "./context/transaction.js";

export type AgentEvent =
  | { type: "thinking"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "reasoning_delta"; content: string }
  | { type: "text"; content: string }
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; name: string; args: unknown; id?: string }
  | { type: "tool_result"; name: string; result: unknown; id?: string }
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
  provider?: "openrouter" | "anthropic" | "openai" | "google" | "ollama";
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
  /** When false, disables the `spawn_agent` tool. Defaults to true. Sub-agents set this to false. */
  allowSubagents?: boolean;
  /**
   * Post-edit verification command. Set to run exactly this command after
   * coding edits; "none" disables verification; unset auto-detects (tsc +
   * test/build script).
   */
  verifyCommand?: string;
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
  transaction?: TransactionManager;
  signal?: AbortSignal;
  /**
   * Model/provider/API-key config carried through so `spawn_agent` can
   * construct a working sub-agent that inherits the parent's credentials.
   */
  modelConfig?: {
    model?: string;
    provider?: AgentConfig["provider"];
    anthropicApiKey?: string;
    openaiApiKey?: string;
    openrouterApiKey?: string;
    googleApiKey?: string;
    mcpServers?: McpServerConfig[];
  };
  /** When false, the `spawn_agent` tool is disabled (prevents unbounded sub-agent recursion). */
  allowSubagents?: boolean;
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
