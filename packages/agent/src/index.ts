import pathModule from "node:path";
import { streamText, generateText, tool, jsonSchema, type CoreMessage, type LanguageModel } from "ai";
import { CodeIndexer } from "crayon-indexer";
import type { AgentConfig, AgentEvent, AgentResult } from "./types.js";
import { WorkingMemory } from "./memory/working.js";
import { EpisodicMemory } from "./memory/episodic.js";
import { classifyTask, createPlan, type TaskMode } from "./planner/plan.js";
import { buildStaticSystemPrompt, buildDynamicContext } from "./context/manager.js";
import { getExecutionModel } from "./models/router.js";
import type { ModelConfig } from "./models/router.js";
import { createTools } from "./tools/index.js";
import { McpClient } from "./tools/mcp.js";
import { runEvaluation } from "./evaluator/check.js";
import { withRetry } from "./services/withRetry.js";
import { autoCommitEdits } from "./services/autoCommit.js";
import { microCompact, autoCompact, getCompactionLevel } from "./context/compaction.js";
import { FileStateCache } from "./context/fileState.js";
import { TransactionManager } from "./context/transaction.js";

/** Tools that are safe to execute concurrently (read-only). Exported for consumer use. */
export { CONCURRENT_SAFE_TOOLS };
const CONCURRENT_SAFE_TOOLS = new Set([
  "read_file",
  "grep",
  "search_codebase",
  "explain_codebase",
  "find_usages",
  "get_dependents",
  "get_dependencies",
  "get_impact_analysis",
  "list_directory",
  "git_status",
  "git_diff",
  "web_search",
  "list_background",
  "read_background_output",
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
  public activePtyWrite?: (data: string) => void;

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

  handleTerminalInput(data: string): boolean {
    if (this.activePtyWrite) {
      this.activePtyWrite(data);
      return true;
    }
    return false;
  }

  /**
   * Propose short follow-up requests based on the last exchange — used by UI
   * surfaces for one-click suggestion chips. Cheap single completion, does
   * NOT touch conversation history. Returns [] on any failure.
   */
  async suggestFollowUps(count = 3): Promise<string[]> {
    const recent = this.history.slice(-4).map((m) => {
      const content =
        typeof m.content === "string"
          ? m.content
          : m.content.map((p: any) => (p?.type === "text" ? p.text : "")).join(" ");
      return `${m.role}: ${content.slice(0, 1500)}`;
    });
    if (recent.length === 0) return [];

    try {
      const { text } = await generateText({
        model: getExecutionModel(this.config),
        system:
          `You suggest follow-up actions for a coding-assistant chat. Given the last exchange, ` +
          `propose ${count} short (under 10 words), concrete, actionable next requests the user might click. ` +
          `Respond with ONLY a JSON array of strings — no prose, no markdown.`,
        prompt: recent.join("\n\n"),
        maxTokens: 200,
        abortSignal: AbortSignal.timeout(15_000),
      });
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, count);
        }
      }
      // Fallback: parse line-per-suggestion output
      return text
        .split("\n")
        .map((l) => l.replace(/^[\s\d.\-*•"']+|["',]+$/g, "").trim())
        .filter((l) => l.length > 4 && l.length < 90)
        .slice(0, count);
    } catch {
      return [];
    }
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

  /**
   * One model turn: stream text/reasoning (parsing `<thinking>` tags out of
   * the text channel), then return the tool calls the model requested WITHOUT
   * executing them — the caller (the agentic loop) executes and decides
   * whether to continue. `maxSteps: 1` guarantees the SDK does not run its own
   * multi-step loop. Preserves the idle-timeout guard, retry-with-backoff, and
   * bounded metadata awaits.
   */
  private async streamStep(
    model: LanguageModel,
    messages: CoreMessage[],
    aiTools: Record<string, any> | undefined,
    signal?: AbortSignal
  ): Promise<{
    text: string;
    finishReason?: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }>;
    assistantMessages: CoreMessage[];
  }> {
    const IDLE_TIMEOUT_MS = Number(process.env.CRAYON_STREAM_IDLE_MS) || 60_000;
    const idleController = new AbortController();
    const combinedSignal = signal
      ? AbortSignal.any([signal, idleController.signal])
      : idleController.signal;

    const { result: streamResult } = await withRetry(
      async () =>
        streamText({
          model,
          messages,
          tools: aiTools,
          // We drive the loop; the SDK does exactly one generation per call.
          maxSteps: 1,
          maxRetries: 3,
          abortSignal: combinedSignal,
        }),
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

    const streamIterator = streamResult.fullStream[Symbol.asyncIterator]();
    try {
      while (true) {
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const nextP = streamIterator.next();
        nextP.catch(() => {});
        const nextChunk = await Promise.race([
          nextP,
          new Promise<never>((_, reject) => {
            idleTimer = setTimeout(() => reject(new Error("__CRAYON_IDLE_TIMEOUT__")), IDLE_TIMEOUT_MS);
          }),
        ]).finally(() => {
          if (idleTimer) clearTimeout(idleTimer);
        });
        if (nextChunk.done) break;
        const chunk = nextChunk.value;
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
                const before = buffer.slice(0, startIdx);
                if (before) {
                  responseText += before;
                  this.emit({ type: "text_delta", content: before });
                }
                this.emit({ type: "thinking", content: "Thinking..." });
                inThinking = true;
                buffer = buffer.slice(startIdx + 10);
              } else {
                const possibleTag = buffer.lastIndexOf("<");
                if (possibleTag !== -1 && "<thinking>".startsWith(buffer.slice(possibleTag))) {
                  const safePart = buffer.slice(0, possibleTag);
                  if (safePart) {
                    responseText += safePart;
                    this.emit({ type: "text_delta", content: safePart });
                  }
                  buffer = buffer.slice(possibleTag);
                  break;
                } else {
                  responseText += buffer;
                  this.emit({ type: "text_delta", content: buffer });
                  buffer = "";
                }
              }
            } else {
              const endIdx = buffer.indexOf("</thinking>");
              if (endIdx !== -1) {
                const reasoning = buffer.slice(0, endIdx);
                if (reasoning) this.emit({ type: "reasoning_delta", content: reasoning });
                inThinking = false;
                buffer = buffer.slice(endIdx + 11);
              } else {
                const possibleTag = buffer.lastIndexOf("<");
                if (possibleTag !== -1 && "</thinking>".startsWith(buffer.slice(possibleTag))) {
                  const safeReasoning = buffer.slice(0, possibleTag);
                  if (safeReasoning) this.emit({ type: "reasoning_delta", content: safeReasoning });
                  buffer = buffer.slice(possibleTag);
                  break;
                } else {
                  this.emit({ type: "reasoning_delta", content: buffer });
                  buffer = "";
                }
              }
            }
          }
        }
      }
    } catch (streamErr: any) {
      if (streamErr?.message === "__CRAYON_IDLE_TIMEOUT__") {
        idleController.abort();
        try {
          await streamIterator.return?.(undefined as any);
        } catch {
          /* best effort */
        }
        throw new Error(
          `Model did not respond within ${Math.round(IDLE_TIMEOUT_MS / 1000)}s (endpoint may be down or rate-limited). Use /model to switch models.`
        );
      }
      throw streamErr;
    }

    if (buffer) {
      if (inThinking) {
        this.emit({ type: "reasoning_delta", content: buffer });
      } else {
        responseText += buffer;
        this.emit({ type: "text_delta", content: buffer });
      }
    }

    const bounded = <T,>(p: Promise<T> | undefined, ms = 5_000): Promise<T | undefined> =>
      p
        ? Promise.race([
            p.catch(() => undefined as T | undefined),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
          ])
        : Promise.resolve(undefined);

    const usage = await bounded(streamResult.usage);
    const finishReason = await bounded(streamResult.finishReason);
    const toolCalls = (await bounded(streamResult.toolCalls)) ?? [];
    const response = await bounded(streamResult.response);
    const assistantMessages = (response?.messages ?? []) as CoreMessage[];

    return {
      text: responseText,
      finishReason,
      usage: usage
        ? { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens }
        : undefined,
      toolCalls: (toolCalls as any[]).map((tc) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      })),
      assistantMessages,
    };
  }

  /**
   * Execute a batch of tool calls from one model turn and return the
   * `tool`-role message to append. Read-only tools (CONCURRENT_SAFE_TOOLS) run
   * concurrently; mutating tools run sequentially in call order so edits and
   * transaction snapshots stay deterministic. Edited paths are collected into
   * `edits` (workspace-relative).
   */
  private async executeToolCalls(
    toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }>,
    execMap: Map<string, (args: unknown) => Promise<unknown>>,
    edits: string[]
  ): Promise<CoreMessage> {
    const results = new Map<string, unknown>();
    const EDIT_TOOLS = ["edit_file", "write_file", "overwrite_file", "edit_ast", "multi_edit"];

    const runOne = async (call: { toolCallId: string; toolName: string; args: unknown }) => {
      this.emit({ type: "tool_call", name: call.toolName, args: call.args, id: call.toolCallId });
      let result: unknown;
      const exec = execMap.get(call.toolName);
      if (!exec) {
        result = { error: `Unknown tool: ${call.toolName}` };
      } else {
        try {
          result = await exec(call.args);
        } catch (e: any) {
          result = { error: e?.message || String(e) };
        }
      }
      this.workingMemory.addToolOutput(call.toolName, result);
      if (EDIT_TOOLS.includes(call.toolName)) {
        const r = result as { path?: string; paths?: string[]; success?: boolean };
        if (r?.success !== false) {
          const paths = r?.paths ?? (r?.path ? [r.path] : []);
          for (const p of paths) {
            this.workingMemory.markEdited(p);
            const abs = pathModule.resolve(this.config.workspaceRoot, p);
            const rel = pathModule.relative(this.config.workspaceRoot, abs);
            edits.push(rel && !rel.startsWith("..") ? rel : p);
          }
        }
      }
      this.emit({ type: "tool_result", name: call.toolName, result, id: call.toolCallId });
      results.set(call.toolCallId, result);
    };

    const safe = toolCalls.filter((c) => CONCURRENT_SAFE_TOOLS.has(c.toolName));
    const unsafe = toolCalls.filter((c) => !CONCURRENT_SAFE_TOOLS.has(c.toolName));
    await Promise.all(safe.map(runOne));
    for (const c of unsafe) await runOne(c);

    return {
      role: "tool",
      content: toolCalls.map((c) => ({
        type: "tool-result" as const,
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        result: results.get(c.toolCallId) ?? { error: "no result" },
      })),
    } as CoreMessage;
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
      askUser: this.config.askUser,
      fileState: this.fileState,
      transaction: this.transaction,
      signal: options.signal,
      modelConfig: this.subagentModelConfig(),
      allowSubagents: this.config.allowSubagents,
      setActivePtyWrite: (writeFn?: (data: string) => void) => {
        this.activePtyWrite = writeFn;
      },
    };

    this.emit({ type: "thinking", content: "Preparing context and tools..." });
    let staticSystemPrompt = buildStaticSystemPrompt(mode);
    // Plan mode + coding task: explore read-only and produce a reviewable plan
    // instead of attempting (blocked) edits. The consumer shows the plan and
    // asks the user to approve execution.
    const planningOnly = this.config.permissionMode === "plan" && mode === "coding";
    if (planningOnly) {
      staticSystemPrompt += `

## PLAN MODE (read-only)
You are in plan mode. Do NOT edit files or run commands that modify anything — write tools are blocked and will fail.
1. Explore the codebase with read-only tools (read_file, search_codebase, grep, list_directory) to ground the plan in reality.
2. Then output a concrete implementation plan as a numbered markdown list: each step names the exact file(s) and the change to make.
3. End with a one-line summary of the expected outcome. Do not ask for approval — just produce the plan.`;
    }

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

    // Crayon drives its own agentic loop (see the step loop below) rather than
    // delegating tool execution to the SDK's maxSteps. So model-facing tools
    // carry only their schema (no `execute`) — the SDK emits the tool call and
    // stops; we execute it ourselves. `execMap` holds the real executors,
    // keyed by the same name, and records read-only tools for safe parallelism.
    const tools = createTools(toolCtx);
    const aiTools: Record<string, any> = {};
    const execMap = new Map<string, (args: unknown) => Promise<unknown>>();

    for (const [name, t] of Object.entries(tools)) {
      const toolDef = t as {
        description: string;
        parameters: Parameters<typeof tool>[0]["parameters"];
        execute: (args: unknown) => Promise<unknown>;
      };
      aiTools[name] = tool({ description: toolDef.description, parameters: toolDef.parameters });
      execMap.set(name, (args) => toolDef.execute(args));
    }

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
      });
      execMap.set(safeName, async (args) => {
        try {
          return await this.mcpClient.callTool(t.server, t.tool.name, args as any);
        } catch (e: any) {
          return { error: e.message };
        }
      });
    }



    const maxEvalRetries = this.config.maxEvalRetries ?? 5;
    let evalRetries = 0;
    let noEditNudges = 0; // escalating correctives when a coding task makes no edits
    const MAX_NO_EDIT_NUDGES = 3;
    let summary = "";
    const edits: string[] = [];
    let totalSteps = 0;

    const useTools = mode !== "chat";
    const maxSteps = mode === "chat" ? 1 : mode === "advisory" ? 12 : (this.config.maxSteps ?? 25);

    let totalSessionCost = 0;
    // Hard limit to prevent runaway usage — configurable per run / via env.
    const MAX_SESSION_COST = this.config.maxSessionCost ?? (Number(process.env.CRAYON_MAX_COST) || 2.0);

    // Decompose non-trivial coding tasks into an execution plan up front. This
    // grounds the loop (the plan is injected into dynamic context) and gives
    // the UI a checklist via the `plan` event. Best-effort — a planning
    // failure never blocks the actual work. Plan mode produces its own plan.
    if (mode === "coding" && !planningOnly && !options.signal?.aborted) {
      this.emit({ type: "thinking", content: "Planning the task..." });
      try {
        const generated = await createPlan(task, modelConfig);
        if (generated.length > 1) {
          plan.push(...generated);
          this.emit({ type: "plan", steps: generated });
        }
      } catch {
        /* planning is optional — proceed without it */
      }
    }

    while (evalRetries <= maxEvalRetries) {
      if (options.signal?.aborted) {
        throw new Error("Agent execution aborted");
      }

      // ── Inner agentic loop: one model turn per iteration ─────────────
      // Rebuild dynamic context and compact BEFORE each turn so the model
      // always sees fresh workspace state — the SDK's internal maxSteps loop
      // could not re-ground mid-sequence. We execute the requested tools
      // ourselves between turns (read-only ones concurrently).
      const model = getExecutionModel(modelConfig);
      const pricing = getModelPricing(model.modelId || modelConfig.model || "");
      let responseText = "";
      let lastFinishReason: string | undefined;
      let sawUsage = false;
      let completedNaturally = false;

      for (let step = 0; step < maxSteps; step++) {
        if (options.signal?.aborted) throw new Error("Agent execution aborted");

        // Fresh workspace context each turn (the key win over SDK maxSteps).
        const dynamicMsg = messages.find(
          (m) =>
            m.role === "system" &&
            (m.content === "" ||
              (typeof m.content === "string" && m.content.startsWith("Here is the current workspace environment")))
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

        // Compaction before the call.
        const ctxWindow = getContextWindow(model.modelId || modelConfig.model || "");
        const compactionLevel = getCompactionLevel(messages, ctxWindow);
        if (compactionLevel === "auto") {
          this.emit({ type: "thinking", content: "Context window filling up, compacting conversation..." });
          const compacted = await autoCompact(messages, modelConfig);
          messages.splice(0, messages.length, ...compacted);
        } else if (compactionLevel === "micro") {
          messages.splice(0, messages.length, ...microCompact(messages));
        }

        this.emit({ type: "thinking", content: "Thinking..." });

        const turn = await this.streamStep(model, messages, useTools ? aiTools : undefined, options.signal);
        totalSteps++;
        lastFinishReason = turn.finishReason;

        if (turn.usage) {
          sawUsage = true;
          this.emit({
            type: "usage",
            promptTokens: turn.usage.promptTokens,
            completionTokens: turn.usage.completionTokens,
            totalTokens: turn.usage.totalTokens,
          });
          totalSessionCost +=
            (turn.usage.promptTokens * pricing.input) / 1_000_000 +
            (turn.usage.completionTokens * pricing.output) / 1_000_000;
          if (totalSessionCost > MAX_SESSION_COST) {
            throw new Error("Cost limit exceeded. Aborting to prevent runaway usage.");
          }
        }

        // The most recent turn's text is the working answer.
        if (turn.text.trim()) responseText = turn.text;

        // Append the assistant message(s) so the next turn sees full history.
        if (turn.assistantMessages.length) messages.push(...turn.assistantMessages);

        if (turn.toolCalls.length === 0) {
          completedNaturally = true;
          break;
        }

        // Execute the requested tools and feed the results back.
        const toolMsg = await this.executeToolCalls(turn.toolCalls, execMap, edits);
        messages.push(toolMsg);
      }

      // Empty provider response — quota/rate-limit swallowed into an empty stream.
      if (!responseText.trim() && !sawUsage && !lastFinishReason && edits.length === 0) {
        throw new Error(
          "Model returned an empty response. This usually means the API quota is exhausted or the provider is rate-limiting — check your plan/billing or switch models with /model."
        );
      }

      const exhausted = !completedNaturally || lastFinishReason === "length";

      // Ran out of steps mid tool-loop without a written answer — force one
      // tool-free synthesis pass so the user still gets a reply.
      if (exhausted && !responseText.trim() && mode !== "chat") {
        this.emit({ type: "thinking", content: "Reached step limit — composing an answer from gathered context..." });
        try {
          const synth = await generateText({
            model,
            messages: [
              ...messages,
              { role: "user", content: "Stop calling tools. Using everything you have gathered so far, answer my previous request directly and concisely now." },
            ],
          });
          if (synth.text?.trim()) {
            responseText = synth.text.trim();
            this.emit({ type: "text_delta", content: responseText });
          }
        } catch { /* fall through to warning */ }
      }

      // Only warn if we still have nothing to show.
      if (exhausted && !responseText.trim()) {
        const warnMsg = "⚠️ [System: Reached the maximum number of steps without completing. Try breaking the task down or raising the limit.]";
        responseText += warnMsg;
        this.emit({ type: "text_delta", content: warnMsg });
      }

      // Weaker models sometimes emit a tool call as plain-text JSON instead of
      // a real tool call. Strip those blobs so they never become the answer.
      responseText = responseText
        .replace(/\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"(?:parameters|arguments|args)"\s*:\s*\{[\s\S]*?\}\s*\}/g, "")
        .trim();

      if (responseText) {
        this.emit({ type: "text", content: responseText });
        summary = responseText;
      }
      // (edited paths are collected inside executeToolCalls)

      // History push moved outside the while loop to avoid duplicates on eval retries

      // Coding task ended with no file changes — weaker models often "answer"
      // with a code block or a text tool-call instead of editing. Nudge with an
      // escalating directive and retry, up to MAX_NO_EDIT_NUDGES times, before
      // giving up. Each retry is firmer and more prescriptive than the last.
      if (mode === "coding" && !this.workingMemory.hasEdits() && noEditNudges < MAX_NO_EDIT_NUDGES) {
        const nudges = [
          "You did NOT modify any files — describing the change or printing code does not count. Apply it now with a real tool call: read_file the target, then edit_file (copy old_string exactly) or write_file. Do not reply with code.",
          "Still no file was changed. STOP explaining. Your NEXT action must be a single tool call — write_file for a new file, or edit_file with an old_string copied verbatim from the file you read. Emit only the tool call, no prose.",
          "FINAL ATTEMPT. You have not edited anything. Call write_file or edit_file RIGHT NOW with the complete change. If the file exists, use edit_file (or overwrite_file with the full new contents). Do not output any text — only the tool call.",
        ];
        const msg = nudges[Math.min(noEditNudges, nudges.length - 1)];
        noEditNudges++;
        this.emit({ type: "thinking", content: `No edit applied — nudging the model to use tools (attempt ${noEditNudges}/${MAX_NO_EDIT_NUDGES})...` });
        messages.push({ role: "assistant", content: responseText || "(no changes were made)" });
        messages.push({ role: "user", content: msg });
        continue;
      }

      if (mode !== "coding" || !this.workingMemory.hasEdits()) {
        break;
      }

      const evalResult = await runEvaluation(
        this.config.workspaceRoot,
        this.config.verifyCommand ?? process.env.CRAYON_VERIFY_CMD
      );
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
      // Opt-in git workflow: commit this task's edits with a generated message.
      if (this.config.autoCommit && edits.length > 0) {
        const ac = await autoCommitEdits(this.config.workspaceRoot, task, [...new Set(edits)]);
        if (ac.committed) {
          this.emit({ type: "text", content: `\n[git] Committed ${[...new Set(edits)].length} file(s): ${ac.message} (${ac.hash?.slice(0, 7)})` });
        }
      }
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
      planned: planningOnly && edits.length === 0,
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
