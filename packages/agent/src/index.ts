import { streamText, tool, jsonSchema, type CoreMessage } from "ai";
import { CodeIndexer } from "@crayon/indexer";
import type { AgentConfig, AgentEvent, AgentResult } from "./types.js";
import { WorkingMemory } from "./memory/working.js";
import { EpisodicMemory } from "./memory/episodic.js";
import { createPlan, classifyTask, type TaskMode } from "./planner/plan.js";
import { buildSystemPrompt } from "./context/manager.js";
import { getExecutionModel } from "./models/router.js";
import type { ModelConfig } from "./models/router.js";
import { createTools } from "./tools/index.js";
import { McpClient } from "./tools/mcp.js";
import { runEvaluation } from "./evaluator/check.js";
import { withRetry } from "./services/withRetry.js";
import { microCompact, autoCompact, getCompactionLevel } from "./context/compaction.js";
import { FileStateCache } from "./context/fileState.js";

/** Tools that are safe to execute concurrently (read-only). Exported for consumer use. */
export { CONCURRENT_SAFE_TOOLS };
const CONCURRENT_SAFE_TOOLS = new Set([
  "read_file",
  "grep",
  "search_codebase",
  "list_directory",
  "git_status",
  "git_diff",
  "thinking",
]);

export class CrayonAgent {
  private indexer: CodeIndexer;
  private workingMemory = new WorkingMemory();
  private episodicMemory: EpisodicMemory;
  private config: AgentConfig;
  private history: CoreMessage[] = [];
  private mcpClient: McpClient;
  private fileState = new FileStateCache();

  public get tools() {
    return createTools({
      workspaceRoot: this.config.workspaceRoot,
      indexer: this.indexer,
      permissionMode: this.config.permissionMode,
      onEvent: this.config.onEvent,
      approveCommand: this.config.approveCommand,
      approveEdit: this.config.approveEdit,
      fileState: this.fileState,
    });
  }

  constructor(config: AgentConfig) {
    this.config = config;
    this.indexer = new CodeIndexer(config.workspaceRoot);
    this.episodicMemory = new EpisodicMemory(config.workspaceRoot);
    this.mcpClient = new McpClient(config.mcpServers || []);
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

  async run(
    task: string,
    options: { currentFile?: string; selection?: string; skipHistory?: boolean; signal?: AbortSignal } = {}
  ): Promise<AgentResult> {
    const mode: TaskMode = classifyTask(task);

    if (mode === "chat") {
      this.emit({ type: "thinking", content: "Initializing indexer..." });
      await this.indexer.init();
    } else {
      this.emit({ type: "thinking", content: "Indexing workspace..." });
      await this.init();
    }

    this.emit({ type: "thinking", content: "Connecting to MCP servers..." });
    await this.mcpClient.connectAll();

    const modelConfig: ModelConfig = {
      model: this.config.model,
      provider: this.config.provider,
      anthropicApiKey: this.config.anthropicApiKey,
      openaiApiKey: this.config.openaiApiKey,
      openrouterApiKey: this.config.openrouterApiKey,
      googleApiKey: this.config.googleApiKey,
    };

    this.emit({ type: "thinking", content: "Gathering project intelligence..." });
    const intelligence = mode === "chat" ? null : await this.indexer.getIntelligence();
    
    this.emit({ type: "thinking", content: "Planning approach..." });
    const plan = await createPlan(task, modelConfig);
    if (plan.length > 0) {
      this.emit({ type: "plan", steps: plan });
    }

    const toolCtx = {
      workspaceRoot: this.config.workspaceRoot,
      indexer: this.indexer,
      permissionMode: this.config.permissionMode,
      onEvent: this.config.onEvent,
      approveCommand: this.config.approveCommand,
      approveEdit: this.config.approveEdit,
      fileState: this.fileState,
    };

    const userMessage: CoreMessage = { role: "user", content: task };
    const messages: CoreMessage[] = options.skipHistory
      ? [userMessage]
      : [...this.history, userMessage];

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
              const resObj = result as Record<string, any>;
              if (resObj && resObj.error === "PERMISSION_DENIED_BY_USER") {
                messages.push({
                  role: "system",
                  content: "The user explicitly denied this action. Do not retry it. Ask the user for alternative directions."
                });
              }
              this.emit({ type: "tool_result", name, result });
              return result;
            },
          }),
        ];
      })
    );

    const mcpTools = await this.mcpClient.listTools();
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
            const resObj = result as Record<string, any>;
            if (resObj && resObj.error === "PERMISSION_DENIED_BY_USER") {
              messages.push({
                role: "system",
                content: "The user explicitly denied this action. Do not retry it. Ask the user for alternative directions."
              });
            }
            this.emit({ type: "tool_result", name: safeName, result });
            return result;
          } catch (e: any) {
            return { error: e.message };
          }
        }
      });
    }

    this.emit({ type: "thinking", content: "Preparing context and tools..." });
    const systemPrompt = await buildSystemPrompt({
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

      // --- Context compaction before LLM call ---
      const compactionLevel = getCompactionLevel(messages);
      if (compactionLevel === "auto") {
        this.emit({ type: "thinking", content: "Context window filling up, compacting conversation..." });
        const compacted = await autoCompact(messages, modelConfig);
        messages.splice(0, messages.length, ...compacted);
      } else if (compactionLevel === "micro") {
        const compacted = microCompact(messages);
        messages.splice(0, messages.length, ...compacted);
      }

      const model = getExecutionModel(modelConfig);

      this.emit({ type: "thinking", content: "Thinking..." });
      // Use streamText with retry wrapper for resilience
      const { result: streamResult } = await withRetry(
        async () => {
          return streamText({
            model,
            system: systemPrompt,
            messages,
            tools: useTools ? aiTools : undefined,
            maxSteps,
            abortSignal: options.signal,
            onStepFinish: (step) => {
              const { usage } = step;
              const stepCost = (usage.promptTokens * 3 / 1_000_000) + (usage.completionTokens * 15 / 1_000_000);
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
    const finalSummary =
      summary ||
      (mode === "advisory"
        ? "I searched the codebase but couldn't generate a full answer. Try rephrasing your question."
        : `Completed in ${totalSteps} steps. Edited: ${[...new Set(edits)].join(", ") || "none"}.`);

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
  }

  getIndexer(): CodeIndexer {
    return this.indexer;
  }

  setPermissionMode(mode: import("./types.js").PermissionMode): void {
    this.config.permissionMode = mode;
  }

  close(): void {
    this.episodicMemory.close?.();
    this.indexer.stopWatching?.();
    this.mcpClient?.close?.();
  }
}

export { CrayonAgent as Agent };
export * from "./types.js";
export { classifyTask } from "./planner/plan.js";
export { microCompact, autoCompact, getCompactionLevel } from "./context/compaction.js";
export { FileStateCache } from "./context/fileState.js";
export { withRetry } from "./services/withRetry.js";
export type { RetryOptions } from "./services/withRetry.js";
