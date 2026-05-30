import { streamText, tool, type CoreMessage } from "ai";
import { CodeIndexer } from "@crayon/indexer";
import type { AgentConfig, AgentEvent, AgentResult } from "./types.js";
import { WorkingMemory } from "./memory/working.js";
import { EpisodicMemory } from "./memory/episodic.js";
import { createPlan, classifyTask, type TaskMode } from "./planner/plan.js";
import { buildSystemPrompt } from "./context/manager.js";
import { getExecutionModel } from "./models/router.js";
import { createTools } from "./tools/index.js";
import { McpClient } from "./tools/mcp.js";
import { runEvaluation } from "./evaluator/check.js";

export class CrayonAgent {
  private indexer: CodeIndexer;
  private workingMemory = new WorkingMemory();
  private episodicMemory: EpisodicMemory;
  private config: AgentConfig;
  private history: CoreMessage[] = [];
  private mcpClient: McpClient;

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

  async run(
    task: string,
    options: { currentFile?: string; selection?: string; skipHistory?: boolean } = {}
  ): Promise<AgentResult> {
    const mode: TaskMode = classifyTask(task);

    if (mode === "chat") {
      await this.indexer.init();
    } else {
      await this.init();
    }

    await this.mcpClient.connectAll();

    const modelConfig = {
      model: this.config.model,
      provider: this.config.provider,
      anthropicApiKey: this.config.anthropicApiKey,
      openaiApiKey: this.config.openaiApiKey,
      openrouterApiKey: this.config.openrouterApiKey,
      googleApiKey: this.config.googleApiKey,
    };

    const intelligence = mode === "chat" ? null : await this.indexer.getIntelligence();
    const plan = await createPlan(task, modelConfig);
    if (plan.length > 0) {
      this.emit({ type: "plan", steps: plan });
    }

    const toolCtx = {
      workspaceRoot: this.config.workspaceRoot,
      indexer: this.indexer,
      onEvent: this.config.onEvent,
      approveCommand: this.config.approveCommand,
      approveEdit: this.config.approveEdit,
    };

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

    const mcpTools = await this.mcpClient.listTools();
    for (const t of mcpTools) {
      const safeName = `mcp_${t.server}_${t.tool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");

      aiTools[safeName] = tool({
        description: `[MCP Server: ${t.server}] ${t.tool.description || t.tool.name}`,
        // @ts-ignore
        parameters: t.tool.inputSchema as any,
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

    const userMessage: CoreMessage = { role: "user", content: task };
    const messages: CoreMessage[] = options.skipHistory
      ? [userMessage]
      : [...this.history, userMessage];

    const useTools = mode !== "chat";
    const maxSteps = mode === "chat" ? 1 : mode === "advisory" ? 8 : (this.config.maxSteps ?? 25);

    while (evalRetries <= maxEvalRetries) {
      const model = getExecutionModel(modelConfig);

      // Use streamText for real-time token streaming
      const streamResult = streamText({
        model,
        system: systemPrompt,
        messages,
        tools: useTools ? aiTools : undefined,
        maxSteps,
      });

      let responseText = "";

      // Emit token deltas in real time
      for await (const delta of streamResult.textStream) {
        responseText += delta;
        this.emit({ type: "text_delta", content: delta });
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
          if (step.text?.trim()) responseText = step.text.trim();
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

      if (!options.skipHistory) {
        this.history.push(userMessage);
        this.history.push({ role: "assistant", content: responseText || "Done." });
        // Keep last 20 messages
        if (this.history.length > 20) {
          this.history = this.history.slice(-20);
        }
      }

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

  close(): void {
    this.episodicMemory.close?.();
    this.indexer.stopWatching?.();
    this.mcpClient?.close?.();
  }
}

export { CrayonAgent as Agent };
export * from "./types.js";
export { classifyTask } from "./planner/plan.js";
