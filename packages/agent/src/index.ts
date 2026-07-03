import { streamText, tool, jsonSchema, type CoreMessage } from "ai";
import { CodeIndexer } from "crayon-indexer";
import type { AgentConfig, AgentEvent, AgentResult } from "./types.js";
import { WorkingMemory } from "./memory/working.js";
import { EpisodicMemory } from "./memory/episodic.js";
import { classifyTask, type TaskMode } from "./planner/plan.js";
import { buildStaticSystemPrompt, buildDynamicContext } from "./context/manager.js";
import { getExecutionModel } from "./models/router.js";
import type { ModelConfig } from "./models/router.js";
import { createTools } from "./tools/index.js";
import { McpClient } from "./tools/mcp.js";
import { runEvaluation } from "./evaluator/check.js";
import { withRetry } from "./services/withRetry.js";
import { microCompact, autoCompact, getCompactionLevel } from "./context/compaction.js";
import { FileStateCache } from "./context/fileState.js";
import { TransactionManager } from "./context/transaction.js";

/** Tools that are safe to execute concurrently (read-only). Exported for consumer use. */
export { CONCURRENT_SAFE_TOOLS };
const CONCURRENT_SAFE_TOOLS = new Set([
  "read_file",
  "grep",
  "search_codebase",
  "find_usages",
  "get_dependents",
  "get_dependencies",
  "get_impact_analysis",
  "list_directory",
  "git_status",
  "git_diff",
  "thinking",
]);

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet': { input: 3, output: 15 },
  'claude-haiku': { input: 0.25, output: 1.25 },
  'claude-opus': { input: 15, output: 75 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'default': { input: 3, output: 15 },
};

export function getModelPricing(modelName: string) {
  const lower = modelName.toLowerCase();
  for (const key in MODEL_PRICING) {
    if (key !== 'default' && lower.includes(key)) return MODEL_PRICING[key];
  }
  return MODEL_PRICING.default;
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-sonnet': 200000,
  'claude-haiku': 200000,
  'claude-opus': 200000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gemini-2.5': 1000000,
  'gemini-2.0': 1000000,
  'default': 200000,
};

export function getContextWindow(modelName: string) {
  const lower = modelName.toLowerCase();
  for (const key in MODEL_CONTEXT_WINDOWS) {
    if (key !== 'default' && lower.includes(key)) return MODEL_CONTEXT_WINDOWS[key];
  }
  return MODEL_CONTEXT_WINDOWS.default;
}

export class CrayonAgent {
  private indexer: CodeIndexer;
  private workingMemory = new WorkingMemory();
  private episodicMemory: EpisodicMemory;
  private config: AgentConfig;
  private history: CoreMessage[] = [];
  private mcpClient: McpClient;
  private fileState = new FileStateCache();
  private transaction: TransactionManager;

  public get tools() {
    return createTools({
      workspaceRoot: this.config.workspaceRoot,
      indexer: this.indexer,
      permissionMode: this.config.permissionMode,
      onEvent: this.config.onEvent,
      approveCommand: this.config.approveCommand,
      approveEdit: this.config.approveEdit,
      fileState: this.fileState,
      transaction: this.transaction,
      modelConfig: this.subagentModelConfig(),
      allowSubagents: this.config.allowSubagents,
    });
  }

  /** Config forwarded to sub-agents so they inherit model/provider/credentials. */
  private subagentModelConfig() {
    return {
      model: this.config.model,
      provider: this.config.provider,
      anthropicApiKey: this.config.anthropicApiKey,
      openaiApiKey: this.config.openaiApiKey,
      openrouterApiKey: this.config.openrouterApiKey,
      googleApiKey: this.config.googleApiKey,
      mcpServers: this.config.mcpServers,
    };
  }

  constructor(config: AgentConfig) {
    this.config = config;
    this.indexer = new CodeIndexer(config.workspaceRoot);
    this.episodicMemory = new EpisodicMemory(config.workspaceRoot);
    this.mcpClient = new McpClient(config.mcpServers || [], {
      connectTimeoutMs: 30_000,
      onError: (serverName, error) => {
        this.emit({ type: "error", message: `MCP server "${serverName}" failed: ${error.message}` });
      },
    });
    this.transaction = new TransactionManager(config.workspaceRoot);
  }

  private emit(event: AgentEvent): void {
    this.config.onEvent?.(event);
  }

  async init(): Promise<void> {
    await this.indexer.init();
    const stats = await this.indexer.index();
    const intel = await this.indexer.detectIntelligence();

    for (const [key, value] of Object.entries(intel)) {
      if (value) {
        this.episodicMemory.setSemantic(key, String(value));
      }
    }

    this.emit({ type: "thinking", content: `Indexed ${stats.fileCount} files, ${stats.symbolCount} symbols.` });
  }

  clearHistory(): void {
    this.history = [];
    this.workingMemory.clear();
  }

  getHistory(): CoreMessage[] {
    return this.history;
  }

  setHistory(history: CoreMessage[]): void {
    this.history = history;
  }

  getContextFiles(): string[] {
    return this.fileState.getTrackedFiles();
  }

  setModel(model: string): void {
    this.config.model = model;
  }

  setProvider(provider: "anthropic" | "openai" | "openrouter" | "google"): void {
    this.config.provider = provider;
  }

  async run(
    task: string,
    options: { currentFile?: string; selection?: string; skipHistory?: boolean; signal?: AbortSignal } = {}
  ): Promise<AgentResult> {
    try {
      const mode: TaskMode = classifyTask(task);

    this.emit({ type: "thinking", content: "Thinking..." });

    const taskId = `task_${Date.now()}`;
    await this.transaction.beginTransaction(taskId);

    if (mode === "chat") {
      await this.indexer.init();
    } else {
      await this.init();
    }

    try {
      await this.mcpClient.connectAll();
    } catch (mcpErr: any) {
      this.emit({ type: "error", message: `MCP connection failed: ${mcpErr?.message || String(mcpErr)}` });
      // Continue without MCP tools — agent can still work
    }

    const modelConfig: ModelConfig = {
      model: this.config.model,
      provider: this.config.provider,
      anthropicApiKey: this.config.anthropicApiKey,
      openaiApiKey: this.config.openaiApiKey,
      openrouterApiKey: this.config.openrouterApiKey,
      googleApiKey: this.config.googleApiKey,
    };

    const intelligence = mode === "chat" ? null : await this.indexer.getIntelligence();
    
    const plan: string[] = [];

    const toolCtx = {
      workspaceRoot: this.config.workspaceRoot,
      indexer: this.indexer,
      permissionMode: this.config.permissionMode,
      onEvent: this.config.onEvent,
      approveCommand: this.config.approveCommand,
      approveEdit: this.config.approveEdit,
      fileState: this.fileState,
      transaction: this.transaction,
      signal: options.signal,
      modelConfig: this.subagentModelConfig(),
      allowSubagents: this.config.allowSubagents,
    };

    this.emit({ type: "thinking", content: "Preparing context and tools..." });
    const staticSystemPrompt = buildStaticSystemPrompt(mode);

    const staticSystemMessage: CoreMessage = {
      role: "system",
      content: staticSystemPrompt,
      experimental_providerMetadata: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    } as any;

    const dynamicSystemMessage: CoreMessage = {
      role: "system",
      content: "", // Will be dynamically updated at the start of each execution loop iteration
      experimental_providerMetadata: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    } as any;

    const userMessage: CoreMessage = { role: "user", content: task };
    const messages: CoreMessage[] = options.skipHistory
      ? [staticSystemMessage, dynamicSystemMessage, userMessage]
      : [staticSystemMessage, dynamicSystemMessage, ...this.history, userMessage];

    const tools = createTools(toolCtx);
    const aiTools: Record<string, any> = Object.fromEntries(
      Object.entries(tools).map(([name, t]) => {
        const toolDef = t as {
          description: string;
          parameters: Parameters<typeof tool>[0]["parameters"];
          execute: (args: unknown) => Promise<unknown>;
        };
        return [
          name,
          tool({
            description: toolDef.description,
            parameters: toolDef.parameters,
            execute: async (args) => {
              this.emit({ type: "tool_call", name, args });
              const result = await toolDef.execute(args);
              this.workingMemory.addToolOutput(name, result);
              if (name === "edit_file" || name === "write_file" || name === "overwrite_file") {
                const r = result as { path?: string; success?: boolean };
                if (r.path && r.success !== false) {
                  this.workingMemory.markEdited(r.path);
                }
              }
              this.emit({ type: "tool_result", name, result });
              return result;
            },
          }),
        ];
      })
    );

    let mcpTools: Awaited<ReturnType<typeof this.mcpClient.listTools>> = [];
    try {
      mcpTools = await this.mcpClient.listTools();
    } catch (mcpErr: any) {
      this.emit({ type: "error", message: `Failed to list MCP tools: ${mcpErr?.message || String(mcpErr)}` });
      // Continue without MCP tools
    }
    for (const t of mcpTools) {
      const safeName = `mcp_${t.server}_${t.tool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");

      aiTools[safeName] = tool({
        description: `[MCP Server: ${t.server}] ${t.tool.description || t.tool.name}`,
        parameters: jsonSchema(t.tool.inputSchema as any),
        execute: async (args: any) => {
          this.emit({ type: "tool_call", name: safeName, args });
          try {
            const result = await this.mcpClient.callTool(t.server, t.tool.name, args);
            this.workingMemory.addToolOutput(safeName, result);
            this.emit({ type: "tool_result", name: safeName, result });
            return result;
          } catch (e: any) {
            return { error: e.message };
          }
        }
      });
    }



    const maxEvalRetries = this.config.maxEvalRetries ?? 5;
    let evalRetries = 0;
    let summary = "";
    const edits: string[] = [];
    let totalSteps = 0;

    const useTools = mode !== "chat";
    const maxSteps = mode === "chat" ? 1 : mode === "advisory" ? 8 : (this.config.maxSteps ?? 25);

    let totalSessionCost = 0;
    const MAX_SESSION_COST = 2.00; // Hard limit to prevent runaway usage

    while (evalRetries <= maxEvalRetries) {
      if (options.signal?.aborted) {
        throw new Error("Agent execution aborted");
      }

      // Update the dynamic system message with fresh workspace context
      const dynamicMsg = messages.find(
        (m) =>
          m.role === "system" &&
          (m.content === "" || m.content.startsWith("Here is the current workspace environment"))
      );
      if (dynamicMsg) {
        dynamicMsg.content = await buildDynamicContext({
          task,
          plan,
          mode,
          workspaceRoot: this.config.workspaceRoot,
          indexer: this.indexer,
          workingMemory: this.workingMemory,
          episodicMemory: this.episodicMemory,
          intelligence,
          currentFile: options.currentFile,
          selection: options.selection,
        });
      }

      // --- Context compaction before LLM call ---
      const model = getExecutionModel(modelConfig);
      const ctxWindow = getContextWindow(model.modelId || modelConfig.model || "");
      const compactionLevel = getCompactionLevel(messages, ctxWindow);
      if (compactionLevel === "auto") {
        this.emit({ type: "thinking", content: "Context window filling up, compacting conversation..." });
        const compacted = await autoCompact(messages, modelConfig);
        messages.splice(0, messages.length, ...compacted);
      } else if (compactionLevel === "micro") {
        const compacted = microCompact(messages);
        messages.splice(0, messages.length, ...compacted);
      }


      this.emit({ type: "thinking", content: "Thinking..." });
      // Use streamText with retry wrapper for resilience
      const { result: streamResult } = await withRetry(
        async () => {
          return streamText({
            model,
            messages,
            tools: useTools ? aiTools : undefined,
            maxSteps,
            abortSignal: options.signal,
            onStepFinish: (step) => {
              const { usage } = step;
              const pricing = getModelPricing(model.modelId || modelConfig.model || "");
              const stepCost = (usage.promptTokens * pricing.input / 1_000_000) + (usage.completionTokens * pricing.output / 1_000_000);
              totalSessionCost += stepCost;
              if (totalSessionCost > MAX_SESSION_COST) {
                throw new Error("Cost limit exceeded. Aborting to prevent runaway usage.");
              }
            },
          });
        },
        {
          onRetry: (error, attempt, delayMs) => {
            this.emit({
              type: "thinking",
              content: `API error (attempt ${attempt}), retrying in ${Math.round(delayMs / 1000)}s: ${error.message}`,
            });
          },
        }
      );

      let responseText = "";
      let inThinking = false;
      let buffer = "";

      for await (const chunk of streamResult.fullStream) {
        if (chunk.type === "reasoning") {
          this.emit({ type: "reasoning_delta", content: chunk.textDelta });
          continue;
        }
        
        if (chunk.type === "text-delta") {
          buffer += chunk.textDelta;
          
          while (buffer.length > 0) {
            if (!inThinking) {
              const startIdx = buffer.indexOf("<thinking>");
              if (startIdx !== -1) {
                // Emit text before <thinking>
                const before = buffer.slice(0, startIdx);
                if (before) {
                  responseText += before;
                  this.emit({ type: "text_delta", content: before });
                }
                this.emit({ type: "thinking", content: "Thinking..." });
                inThinking = true;
                buffer = buffer.slice(startIdx + 10); // 10 is "<thinking>".length
              } else {
                // If it ends with something that could be `<thinking>`, hold it.
                const possibleTag = buffer.lastIndexOf("<");
                if (possibleTag !== -1 && "<thinking>".startsWith(buffer.slice(possibleTag))) {
                  // Buffer ends with a partial <thinking> tag, emit up to the `<`
                  const safePart = buffer.slice(0, possibleTag);
                  if (safePart) {
                    responseText += safePart;
                    this.emit({ type: "text_delta", content: safePart });
                  }
                  buffer = buffer.slice(possibleTag);
                  break; // Wait for more chunks
                } else {
                  // Safe to emit all
                  responseText += buffer;
                  this.emit({ type: "text_delta", content: buffer });
                  buffer = "";
                }
              }
            } else {
              const endIdx = buffer.indexOf("</thinking>");
              if (endIdx !== -1) {
                // Emit reasoning before </thinking>
                const reasoning = buffer.slice(0, endIdx);
                if (reasoning) {
                  this.emit({ type: "reasoning_delta", content: reasoning });
                }
                inThinking = false;
                buffer = buffer.slice(endIdx + 11); // 11 is "</thinking>".length
              } else {
                // Could end with partial </thinking>
                const possibleTag = buffer.lastIndexOf("<");
                if (possibleTag !== -1 && "</thinking>".startsWith(buffer.slice(possibleTag))) {
                  const safeReasoning = buffer.slice(0, possibleTag);
                  if (safeReasoning) {
                    this.emit({ type: "reasoning_delta", content: safeReasoning });
                  }
                  buffer = buffer.slice(possibleTag);
                  break; // Wait for more chunks
                } else {
                  this.emit({ type: "reasoning_delta", content: buffer });
                  buffer = "";
                }
              }
            }
          }
        }
      }
      
      // Flush any remaining buffer
      if (buffer) {
        if (inThinking) {
           this.emit({ type: "reasoning_delta", content: buffer });
        } else {
           responseText += buffer;
           this.emit({ type: "text_delta", content: buffer });
        }
      }

      // Await the full result for metadata (steps, tool results)
      const steps = await streamResult.steps;
      totalSteps += steps?.length ?? 1;

      try {
        const usage = await streamResult.usage;
        this.emit({
          type: "usage",
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        });
      } catch {
        // Suppress usage resolution error if not supported
      }

      // Check if the agent hit the maximum step limit
      try {
        const finishReason = await streamResult.finishReason;
        if (finishReason === "tool-calls" || finishReason === "length") {
          const warnMsg = "\n\n⚠️ [System: The agent reached the maximum number of steps allowed for this task without completing it. You may need to break the task down or increase the limit.]";
          responseText += warnMsg;
          this.emit({ type: "text_delta", content: warnMsg });
        }
      } catch {
        // Suppress
      }

      // Fallback: if textStream was empty but steps had text
      if (!responseText && steps?.length) {
        for (const step of steps) {
          if (step.text?.trim()) responseText += step.text.trim();
        }
      }

      if (responseText) {
        // Emit full text event for consumers that prefer complete messages
        this.emit({ type: "text", content: responseText });
        summary = responseText;
      }

      // Collect edited files from tool results
      for (const step of steps ?? []) {
        for (const tr of step.toolResults ?? []) {
          const toolName = "toolName" in tr ? String(tr.toolName) : "";
          if (!["edit_file", "write_file", "overwrite_file", "edit_ast"].includes(toolName)) continue;
          const editResult = tr.result as { path?: string; success?: boolean };
          if (editResult?.path && editResult?.success !== false) {
            edits.push(editResult.path);
          }
        }
      }

      // History push moved outside the while loop to avoid duplicates on eval retries

      if (mode !== "coding" || !this.workingMemory.hasEdits()) {
        break;
      }

      const evalResult = await runEvaluation(this.config.workspaceRoot);
      if (!evalResult) break;

      this.emit({
        type: "eval",
        passed: evalResult.passed,
        output: evalResult.stderr || evalResult.stdout,
      });

      if (evalResult.passed) break;

      evalRetries++;
      if (evalRetries > maxEvalRetries) break;

      messages.push({ role: "assistant", content: responseText || "Made edits." });
      messages.push({
        role: "user",
        content: `Tests/build failed. Fix the issues.\n\nCommand: ${evalResult.command}\nExit: ${evalResult.exitCode}\nSTDERR:\n${evalResult.stderr.slice(0, 3000)}\nSTDOUT:\n${evalResult.stdout.slice(0, 3000)}`,
      });
    }

    if (!options.skipHistory) {
      this.history.push(userMessage);
      this.history.push({ role: "assistant", content: summary || "Done." });
      // Keep last 20 messages
      if (this.history.length > 20) {
        this.history = this.history.slice(-20);
      }
    }

    const success = evalRetries <= maxEvalRetries;
    let rollbackMsg = "";
    if (!success) {
      const restored = await this.transaction.rollbackTransaction();
      if (restored.length > 0) {
        rollbackMsg = `\n\n[System: Max retries reached. Rolled back ${restored.length} files to preserve workspace stability.]`;
        this.emit({ type: "text", content: rollbackMsg.trim() });
      }
    } else {
      await this.transaction.commitTransaction();
    }

    const finalSummary =
      summary + rollbackMsg ||
      (mode === "advisory"
        ? "I searched the codebase but couldn't generate a full answer. Try rephrasing your question."
        : `Completed in ${totalSteps} steps. Edited: ${[...new Set(edits)].join(", ") || "none"}.${rollbackMsg}`);

    if (!summary && finalSummary) {
      this.emit({ type: "text", content: finalSummary });
    }

    this.episodicMemory.save({
      task,
      actions: JSON.stringify([...new Set(edits)]),
      outcome: finalSummary,
      success,
      timestamp: new Date().toISOString(),
    });

    this.emit({ type: "done", summary: finalSummary });

    return {
      success,
      summary: finalSummary,
      steps: totalSteps,
      edits: [...new Set(edits)],
    };
    } catch (err: any) {
      await this.transaction.rollbackTransaction();
      this.emit({ type: "error", message: err.message });
      throw err;
    }
  }

  getIndexer(): CodeIndexer {
    return this.indexer;
  }

  setPermissionMode(mode: import("./types.js").PermissionMode): void {
    this.config.permissionMode = mode;
  }

  close(): void {
    this.history = [];
    this.workingMemory.clear();
    this.episodicMemory.close?.();
    this.indexer.stopWatching?.();
    // Fire-and-forget async close — we don't need to await during cleanup
    this.mcpClient?.close?.().catch?.(() => {});
  }
}

export { CrayonAgent as Agent };
export * from "./types.js";
export { classifyTask } from "./planner/plan.js";
export { microCompact, autoCompact, getCompactionLevel } from "./context/compaction.js";
export { FileStateCache } from "./context/fileState.js";
export { withRetry } from "./services/withRetry.js";
export type { RetryOptions } from "./services/withRetry.js";
export { TaskManager } from "./tasks/manager.js";
export { runMcpServer } from './mcp-server.js';
