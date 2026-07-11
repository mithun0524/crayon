import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { CrayonAgent, autoCompact, getModelPricing, type AgentEvent } from "crayon-agent";
import { getEditorContext } from "../bridge.js";

const execFileAsync = promisify(execFile);

/** Popular models per provider for the in-chat model picker. */
const MODELS: Record<string, string[]> = {
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001", "claude-3-7-sonnet-latest"],
  openai: ["gpt-4.5", "gpt-4o", "o3-mini", "o1"],
  google: ["gemini-2.5-pro", "gemini-2.0-flash"],
  openrouter: ["anthropic/claude-sonnet-4-6", "openai/gpt-4o", "google/gemini-2.5-pro"],
  ollama: ["ollama/llama3.1:8b", "ollama/qwen2.5-coder:7b"],
};

const PERMISSION_MODES = ["ask", "auto-edit", "plan", "auto", "bypass"] as const;

/** QuickPick label → SecretStorage key. Exported for the setApiKey command. */
export const API_KEY_SECRETS = {
  Anthropic: "crayon.anthropicApiKey",
  OpenAI: "crayon.openaiApiKey",
  OpenRouter: "crayon.openrouterApiKey",
  Google: "crayon.googleApiKey",
} as const;

/** Transcript entry replayed into a freshly-resolved webview. */
type TranscriptEntry =
  | { kind: "user"; task: string }
  | { kind: "event"; event: AgentEvent };

const TRANSCRIPT_STATE_KEY = "crayon.transcript.v1";
const TRANSCRIPT_CAP = 400;

/**
 * ChatPanelProvider — persistent agent session with real-time streaming.
 *
 * - One agent per workspace, reused across runs (history + episodic memory)
 * - Stop aborts the CURRENT run (AbortController); history survives
 * - API keys come from SecretStorage first, settings/env as fallback
 * - Transcript is buffered host-side and replayed on webview (re)creation,
 *   and persisted to workspaceState so it survives window reloads
 */
export class ChatPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private agent?: CrayonAgent;
  private agentWorkspaceRoot?: string;
  private runAbort?: AbortController;
  private running = false;
  private transcript: TranscriptEntry[];
  // Session accounting for /cost and /files.
  private promptTokens = 0;
  private completionTokens = 0;
  private touchedFiles = new Set<string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly hooks: { onBusyChange?: (busy: boolean) => void } = {}
  ) {
    this.transcript = context.workspaceState.get<TranscriptEntry[]>(TRANSCRIPT_STATE_KEY, []);
  }

  dispose(): void {
    this.runAbort?.abort();
    this.agent?.close();
    this.agent = undefined;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message: unknown) => {
      const msg = message as {
        type?: unknown; task?: unknown; path?: unknown; code?: unknown;
        includeFile?: unknown; includeSelection?: unknown;
      };
      switch (msg.type) {
        case "ready":
          this.postConfig();
          this.postEditorContext();
          this.replayTranscript();
          break;
        case "run":
          if (typeof msg.task === "string" && msg.task.trim()) {
            await this.handleRun(msg.task, {
              includeFile: msg.includeFile !== false,
              includeSelection: msg.includeSelection !== false,
            });
          }
          break;
        case "stop":
          this.stopCurrentRun();
          break;
        case "clear":
          this.clearChat();
          break;
        case "open_file":
          if (typeof msg.path === "string") {
            const line = (msg as { line?: unknown }).line;
            this.openWorkspaceFile(msg.path, typeof line === "number" ? line : undefined);
          }
          break;
        case "insert_code":
          if (typeof msg.code === "string") this.insertAtCursor(msg.code);
          break;
        case "copy":
          if (typeof msg.code === "string") await vscode.env.clipboard.writeText(msg.code);
          break;
        case "set_mode":
          if (typeof (msg as any).mode === "string") await this.setPermissionMode((msg as any).mode);
          break;
        case "set_model":
          if (typeof (msg as any).model === "string") await this.setModel((msg as any).model);
          break;
        case "slash":
          if (typeof (msg as any).name === "string") await this.handleSlash((msg as any).name);
          break;
      }
    });

    // Context pills: tell the webview which file/selection rides along with
    // the next prompt, live as the user moves around the editor.
    const ctxSubs = [
      vscode.window.onDidChangeActiveTextEditor(() => this.postEditorContext()),
      vscode.window.onDidChangeTextEditorSelection(() => this.postEditorContext()),
    ];
    webviewView.onDidDispose(() => ctxSubs.forEach((d) => d.dispose()));

    // The webview (and this view handle) go away when the view is destroyed —
    // e.g. the user drags the container elsewhere. Keep the agent alive; the
    // next resolve replays the transcript.
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) this.view = undefined;
    });
  }

  /** Programmatic entry used by the `crayon.runTask` palette command. */
  async submitTask(task: string): Promise<void> {
    this.postToWebview({ type: "user_task", task });
    await this.handleRun(task);
  }

  /** Clear conversation — invoked from the webview or the view-title button. */
  clearChat(): void {
    this.agent?.clearHistory();
    this.transcript = [];
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.touchedFiles.clear();
    void this.persistTranscript();
    this.postToWebview({ type: "cleared" });
  }

  /** Drop the cached agent so new settings/keys apply on the next run. */
  invalidateAgent(): void {
    this.postConfig();
    if (this.running) return; // don't yank it mid-run; next run rebuilds
    this.agent?.close();
    this.agent = undefined;
    this.agentWorkspaceRoot = undefined;
  }

  private async setPermissionMode(mode: string): Promise<void> {
    if (!(PERMISSION_MODES as readonly string[]).includes(mode)) return;
    await vscode.workspace
      .getConfiguration("crayon")
      .update("permissionMode", mode, vscode.ConfigurationTarget.Global);
    this.agent?.setPermissionMode(mode as never);
    this.postConfig();
    this.postNotice(`Permission mode → **${mode}**`);
  }

  private async setModel(model: string): Promise<void> {
    await vscode.workspace
      .getConfiguration("crayon")
      .update("defaultModel", model, vscode.ConfigurationTarget.Global);
    this.agent?.setModel(model);
    this.postConfig();
    this.postNotice(`Model → **${model}**`);
  }

  /** Operational slash commands mirrored from the terminal. */
  private async handleSlash(name: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cfg = vscode.workspace.getConfiguration("crayon");
    try {
      switch (name) {
        case "diff": {
          if (!folder) return this.postNotice("Open a workspace folder first.");
          const { stdout } = await execFileAsync("git", ["diff"], { cwd: folder, maxBuffer: 10 * 1024 * 1024 });
          return this.postNotice(
            stdout.trim() ? "**git diff**\n\n```diff\n" + stdout.slice(0, 20000) + "\n```" : "No uncommitted changes."
          );
        }
        case "files": {
          const files = [...this.touchedFiles];
          return this.postNotice(
            files.length
              ? "**Files touched this session**\n\n" + files.map((f) => `- \`${f}\``).join("\n")
              : "No files modified this session."
          );
        }
        case "cost": {
          const model = cfg.get<string>("defaultModel") || "claude-sonnet-4-6";
          const pricing = getModelPricing(model);
          const cost = (this.promptTokens * pricing.input + this.completionTokens * pricing.output) / 1_000_000;
          const total = this.promptTokens + this.completionTokens;
          return this.postNotice(
            `**Session usage**\n\n- Tokens: ${total.toLocaleString()} (${this.promptTokens.toLocaleString()} in / ${this.completionTokens.toLocaleString()} out)\n- Est. cost: $${cost.toFixed(4)} · \`${model}\``
          );
        }
        case "easel": {
          if (!folder) return this.postNotice("Open a workspace folder first.");
          const agent = await this.getOrCreateAgent(folder);
          const files = ((agent as { getContextFiles?: () => string[] }).getContextFiles?.() ?? []).map((f) =>
            path.relative(folder, f)
          );
          return this.postNotice(
            files.length
              ? "**Active context (files read)**\n\n" + files.map((f) => `- \`${f}\``).join("\n")
              : "Context is empty."
          );
        }
        case "mcp": {
          if (!folder) return this.postNotice("Open a workspace folder first.");
          const agent = await this.getOrCreateAgent(folder);
          const info = (await (agent as { getMcpInfo?: () => Promise<any[]> }).getMcpInfo?.()) ?? [];
          return this.postNotice(
            info.length
              ? "**MCP servers**\n\n" +
                  info
                    .map((s: any) => `- ${s.connected ? "●" : "✕"} **${s.name}** — ${s.connected ? `${s.tools.length} tools` : "not connected"}`)
                    .join("\n")
              : "No MCP servers configured. Add one in `~/.crayon/mcp.json`."
          );
        }
        case "compact": {
          if (!folder) return this.postNotice("Open a workspace folder first.");
          const agent = await this.getOrCreateAgent(folder);
          const keys = await this.getApiKeys();
          const hist = agent.getHistory();
          const compacted = await autoCompact(hist, {
            model: cfg.get<string>("defaultModel"),
            provider: cfg.get<string>("provider") as never,
            anthropicApiKey: keys.anthropicApiKey,
            openaiApiKey: keys.openaiApiKey,
            openrouterApiKey: keys.openrouterApiKey,
            googleApiKey: keys.googleApiKey,
          });
          agent.setHistory(compacted);
          return this.postNotice(`Compacted ${hist.length} → ${compacted.length} messages.`);
        }
        case "undo": {
          if (this.agent) {
            const h = this.agent.getHistory();
            const lastUser = [...h].reverse().findIndex((m: any) => m.role === "user");
            if (lastUser !== -1) this.agent.setHistory(h.slice(0, h.length - 1 - lastUser));
          }
          const idx = [...this.transcript].reverse().findIndex((e) => e.kind === "user");
          if (idx !== -1) {
            this.transcript = this.transcript.slice(0, this.transcript.length - 1 - idx);
            void this.persistTranscript();
            this.replayTranscript();
          }
          return this.postNotice("Last turn undone.");
        }
        case "memory": {
          return void this.handleRun(
            "Generate project memory and write it to AGENTS.md at the workspace root. Call the generate_project_memory tool."
          );
        }
        default:
          return this.postNotice(`Unknown command: /${name}`);
      }
    } catch (err) {
      this.postNotice(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private postEditorContext(): void {
    const ed = vscode.window.activeTextEditor;
    const isFile = ed && ed.document.uri.scheme === "file";
    this.postToWebview({
      type: "context",
      file: isFile ? vscode.workspace.asRelativePath(ed!.document.uri) : null,
      selectionLines:
        isFile && !ed!.selection.isEmpty ? ed!.selection.end.line - ed!.selection.start.line + 1 : 0,
    });
  }

  private insertAtCursor(code: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("Crayon: open a file to insert into.");
      return;
    }
    editor.edit((b) => b.insert(editor.selection.active, code));
  }

  private postConfig(): void {
    const config = vscode.workspace.getConfiguration("crayon");
    const provider = config.get<string>("provider") || "anthropic";
    this.postToWebview({
      type: "config",
      provider,
      model: config.get<string>("defaultModel") || "claude-sonnet-4-6",
      mode:
        config.get<string>("permissionMode") ||
        ((config.get<boolean>("autoApplyEdits") ?? true) ? "auto-edit" : "ask"),
      models: MODELS[provider] ?? [],
      modes: PERMISSION_MODES,
    });
  }

  private postEvent(event: AgentEvent): void {
    // Session accounting for /cost and /files.
    const e = event as any;
    if (e.type === "usage") {
      this.promptTokens += Number(e.promptTokens) || 0;
      this.completionTokens += Number(e.completionTokens) || 0;
    } else if (e.type === "edit" && typeof e.path === "string") {
      this.touchedFiles.add(e.path);
    }
    // Deltas are streaming sugar — the final "text"/"reasoning" events carry
    // the full content, so deltas are not recorded for replay.
    if (event.type !== "text_delta" && event.type !== "reasoning_delta") {
      this.pushTranscript({ kind: "event", event });
    }
    this.postToWebview({ type: "event", event });
  }

  /** A markdown notice rendered in the transcript (command output). */
  private postNotice(markdown: string): void {
    this.postToWebview({ type: "notice_md", text: markdown });
  }

  private postToWebview(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  private pushTranscript(entry: TranscriptEntry): void {
    this.transcript.push(entry);
    if (this.transcript.length > TRANSCRIPT_CAP) {
      this.transcript = this.transcript.slice(-TRANSCRIPT_CAP);
    }
  }

  private async persistTranscript(): Promise<void> {
    await this.context.workspaceState.update(TRANSCRIPT_STATE_KEY, this.transcript);
  }

  private replayTranscript(): void {
    if (this.transcript.length === 0) return;
    this.postToWebview({
      type: "replay",
      entries: this.transcript,
      running: this.running,
    });
  }

  private stopCurrentRun(): void {
    if (!this.running) return;
    this.runAbort?.abort();
    this.postEvent({ type: "error", message: "Run cancelled." } as AgentEvent);
  }

  private openWorkspaceFile(relPath: string, line?: number): void {
    const root = this.agentWorkspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    // Reject traversal outside the workspace
    const abs = path.resolve(root, relPath);
    if (abs !== root && !abs.startsWith(root + path.sep)) return;
    vscode.workspace.openTextDocument(vscode.Uri.file(abs)).then((doc) => {
      const options: vscode.TextDocumentShowOptions = { preview: false };
      if (line && line > 0) {
        const pos = new vscode.Position(Math.min(line - 1, doc.lineCount - 1), 0);
        options.selection = new vscode.Range(pos, pos);
      }
      vscode.window.showTextDocument(doc, options);
    });
  }

  private async getApiKeys(): Promise<Record<string, string | undefined>> {
    const config = vscode.workspace.getConfiguration("crayon");
    const secrets = this.context.secrets;
    const fromSecretOrConfig = async (secretId: string, envVar: string) =>
      (await secrets.get(secretId)) || config.get<string>(secretId.replace("crayon.", "")) || process.env[envVar];

    return {
      anthropicApiKey: await fromSecretOrConfig(API_KEY_SECRETS.Anthropic, "ANTHROPIC_API_KEY"),
      openaiApiKey: await fromSecretOrConfig(API_KEY_SECRETS.OpenAI, "OPENAI_API_KEY"),
      openrouterApiKey: await fromSecretOrConfig(API_KEY_SECRETS.OpenRouter, "OPENROUTER_API_KEY"),
      googleApiKey: await fromSecretOrConfig(API_KEY_SECRETS.Google, "GOOGLE_GENERATIVE_AI_API_KEY"),
    };
  }

  private async getOrCreateAgent(folder: string): Promise<CrayonAgent> {
    // Reuse agent if same workspace (preserves history + episodic memory)
    if (this.agent && this.agentWorkspaceRoot === folder) {
      return this.agent;
    }

    // Close old agent if workspace changed
    this.agent?.close();

    const config = vscode.workspace.getConfiguration("crayon");
    const keys = await this.getApiKeys();
    const defaultModel = config.get<string>("defaultModel") || "claude-sonnet-4-6";
    const provider = config.get<"openrouter" | "anthropic" | "openai" | "google" | "ollama">("provider") || "anthropic";
    // Permission mode mirrors the terminal (/mode). Fall back to the legacy
    // autoApplyEdits boolean when permissionMode is unset.
    const permissionMode =
      config.get<"ask" | "auto-edit" | "plan" | "auto" | "bypass">("permissionMode") ||
      ((config.get<boolean>("autoApplyEdits") ?? true) ? "auto-edit" : "ask");

    this.agent = new CrayonAgent({
      workspaceRoot: folder,
      model: defaultModel,
      provider,
      permissionMode,
      anthropicApiKey: keys.anthropicApiKey,
      openaiApiKey: keys.openaiApiKey,
      openrouterApiKey: keys.openrouterApiKey,
      googleApiKey: keys.googleApiKey,
      onEvent: (event) => this.postEvent(event),
      approveCommand: async (command) => {
        const choice = await vscode.window.showWarningMessage(
          `Crayon wants to run: ${command}`,
          { modal: true },
          "Approve"
        );
        return choice === "Approve";
      },
      // Called only in "ask" mode (the agent gates the other modes itself):
      // show a diff preview the user accepts or rejects.
      approveEdit: async (relPath, newContent) => {
        const absPath = vscode.Uri.joinPath(vscode.Uri.file(folder), relPath);
        const previewUri = vscode.Uri.parse(`crayon-diff:${absPath.fsPath}`);
        return await vscode.commands.executeCommand<boolean>("crayon.previewEdit", absPath, previewUri, relPath, newContent) ?? false;
      },
    });

    this.agentWorkspaceRoot = folder;
    return this.agent;
  }

  private async handleRun(
    task: string,
    ctxOpts: { includeFile?: boolean; includeSelection?: boolean } = {}
  ): Promise<void> {
    if (this.running) {
      this.postToWebview({ type: "event", event: { type: "error", message: "A run is already in progress — stop it first." } });
      return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      this.postEvent({ type: "error", message: "Open a workspace folder first" } as AgentEvent);
      return;
    }

    // Ollama runs locally and needs no API key.
    const config = vscode.workspace.getConfiguration("crayon");
    const usesOllama =
      config.get<string>("provider") === "ollama" ||
      (config.get<string>("defaultModel") ?? "").startsWith("ollama/");
    if (!usesOllama) {
      const keys = await this.getApiKeys();
      if (!Object.values(keys).some(Boolean)) {
        this.postEvent({
          type: "error",
          message: "No API key found. Run “Crayon: Set API Key” from the command palette.",
        } as AgentEvent);
        return;
      }
    }

    this.pushTranscript({ kind: "user", task });

    let { currentFile, selection } = getEditorContext();
    if (ctxOpts.includeFile === false) currentFile = undefined;
    if (ctxOpts.includeSelection === false) selection = undefined;
    const agent = await this.getOrCreateAgent(folder);

    this.running = true;
    this.runAbort = new AbortController();
    this.hooks.onBusyChange?.(true);
    this.postToWebview({ type: "run_state", running: true });

    let succeeded = false;
    try {
      await agent.run(task, { currentFile, selection, signal: this.runAbort.signal });
      succeeded = !this.runAbort.signal.aborted;
    } catch (err) {
      if (!this.runAbort.signal.aborted) {
        this.postEvent({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        } as AgentEvent);
      }
    } finally {
      this.running = false;
      this.runAbort = undefined;
      this.hooks.onBusyChange?.(false);
      this.postToWebview({ type: "run_state", running: false });
      void this.persistTranscript();
    }

    // Follow-up chips: fire-and-forget, never blocks the run lifecycle.
    if (succeeded) {
      void agent
        .suggestFollowUps(3)
        .then((items) => {
          if (items.length && !this.running) {
            this.postToWebview({ type: "suggestions", items });
          }
        })
        .catch(() => {});
    }
  }

  private getHtml(): string {
    const webview = this.view!.webview;
    const nonce = getNonce();
    const webviewScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Crayon Chat</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --gap: 10px;
      --radius: 8px;
      --accent: var(--vscode-textLink-foreground);
      --dim: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border, rgba(128,128,128,0.25));
      --code-bg: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ── Conversation ─────────────────────────────────────────── */
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px 4px;
      display: flex;
      flex-direction: column;
      gap: var(--gap);
      scroll-behavior: smooth;
    }

    /* Welcome screen */
    #welcome {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--dim);
      padding: 24px;
      text-align: center;
    }
    #welcome .logo {
      font-size: 28px;
      color: var(--accent);
      line-height: 1;
    }
    #welcome .title { font-size: 15px; font-weight: 600; color: var(--vscode-foreground); }
    #welcome .hint { font-size: 12px; max-width: 320px; line-height: 1.5; }
    #welcome kbd {
      font-family: var(--vscode-editor-font-family);
      font-size: 10px;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 1px 5px;
    }

    .msg { max-width: 100%; word-wrap: break-word; line-height: 1.55; }

    /* User turn — right-aligned bubble */
    .msg.user {
      align-self: flex-end;
      max-width: 88%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 7px 12px;
      border-radius: 12px 12px 3px 12px;
      white-space: pre-wrap;
      font-size: 12.5px;
    }

    /* Agent turn — full-width prose, no bubble (Claude-style) */
    .msg.agent {
      align-self: stretch;
      font-size: 13px;
      padding: 2px 0;
    }
    .msg.agent.streaming > :last-child::after {
      content: '▍';
      color: var(--accent);
      animation: blink 1s step-end infinite;
      margin-left: 1px;
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    .msg.agent pre, .diff-body pre, .row-details pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      padding: 8px 10px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
      font-size: 11.5px;
      line-height: 1.45;
    }
    .msg code {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.92em;
    }
    .msg.agent :not(pre) > code {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 0 4px;
    }
    .msg.agent p { margin: 0 0 8px; }
    .msg.agent p:last-child { margin-bottom: 0; }
    .msg.agent ul, .msg.agent ol { margin: 4px 0 8px 18px; }
    .msg.agent h1, .msg.agent h2, .msg.agent h3 { font-size: 13.5px; margin: 10px 0 6px; }
    .msg.agent blockquote {
      border-left: 3px solid var(--border);
      padding-left: 10px;
      color: var(--dim);
      margin: 6px 0;
    }
    .msg.agent a { color: var(--accent); text-decoration: none; }
    .msg.agent a:hover { text-decoration: underline; }
    .msg.agent table { border-collapse: collapse; margin: 8px 0; font-size: 12px; }
    .msg.agent th, .msg.agent td { border: 1px solid var(--border); padding: 3px 8px; }

    /* Activity rows: tools, edits, evals — compact single lines */
    .row {
      align-self: stretch;
      font-family: var(--vscode-editor-font-family);
      font-size: 11.5px;
      color: var(--dim);
      border-left: 2px solid var(--border);
      padding: 1px 0 1px 10px;
      margin-left: 2px;
    }
    .row summary {
      cursor: pointer;
      user-select: none;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .row summary::-webkit-details-marker { display: none; }
    .row summary .chev { transition: transform 0.12s; font-size: 9px; flex-shrink: 0; }
    .row[open] summary .chev { transform: rotate(90deg); }
    .row .tool-name { color: var(--vscode-foreground); font-weight: 600; }
    .row .arg-preview { opacity: 0.75; overflow: hidden; text-overflow: ellipsis; }
    .row .badge {
      font-size: 9px;
      border-radius: 8px;
      padding: 0 6px;
      flex-shrink: 0;
      background: var(--code-bg);
      border: 1px solid var(--border);
    }
    .row.ok { border-left-color: var(--vscode-testing-iconPassed, #73c991); }
    .row.fail { border-left-color: var(--vscode-testing-iconFailed, #f48771); }

    .row .tool-icon { color: var(--accent); flex-shrink: 0; width: 12px; text-align: center; }
    .row .state { margin-left: auto; flex-shrink: 0; display: flex; align-items: center; gap: 4px; padding-left: 8px; }
    .row .check { color: var(--vscode-testing-iconPassed, #73c991); font-weight: 700; }
    .row .cross { color: var(--vscode-testing-iconFailed, #f48771); font-weight: 700; }
    .row .dur { font-size: 9.5px; opacity: 0.7; }
    .row.running summary .tool-name { color: var(--accent); }
    .spinner.mini {
      width: 8px; height: 8px;
      border-width: 1.5px;
      border: 1.5px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .diffstat { margin-left: auto; padding-left: 8px; flex-shrink: 0; font-size: 10.5px; }
    .diffstat .plus { color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b); }
    .diffstat .minus { color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39); }

    .row.reasoning .thinking-label { color: var(--accent); font-style: italic; }
    .row.reasoning.live {
      border-left-color: var(--accent);
    }
    .row.reasoning.live .thinking-label { animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
    .row.reasoning.live .body {
      max-height: 120px;
      overflow: hidden;
      display: flex;
      flex-direction: column-reverse; /* keep the newest thought visible */
    }

    /* Follow-up suggestion chips */
    #suggestions {
      align-self: stretch;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 2px 0;
    }
    .chip {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--accent);
      border-radius: 14px;
      padding: 3px 11px;
      font-size: 11.5px;
      font-family: inherit;
      cursor: pointer;
      text-align: left;
      transition: background 0.1s, border-color 0.1s;
    }
    .chip:hover {
      background: var(--vscode-toolbar-hoverBackground);
      border-color: var(--accent);
    }

    /* Progress accordion — grouped file reads */
    .row.read-group .rg-label { color: var(--vscode-foreground); font-weight: 600; }
    .rg-list { padding: 3px 0 2px 18px; display: flex; flex-direction: column; gap: 2px; }
    .rg-item a.file-link {
      color: var(--dim);
      text-decoration: none;
      cursor: pointer;
      font-size: 11px;
    }
    .rg-item a.file-link:hover { color: var(--accent); text-decoration: underline; }
    .rg-item::before { content: "· "; color: var(--dim); }

    /* Inline citation badges in answers */
    a.cite {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.88em;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0 4px;
      color: var(--accent) !important;
      cursor: pointer;
      white-space: nowrap;
    }
    a.cite:hover { border-color: var(--accent); text-decoration: none !important; }

    .row.edit-row a.file-link {
      color: var(--vscode-gitDecoration-modifiedResourceForeground, #73c991);
      text-decoration: none;
      cursor: pointer;
      font-weight: 600;
    }
    .row.edit-row a.file-link:hover { text-decoration: underline; }

    /* Plan */
    .msg.plan {
      align-self: stretch;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--accent);
      border-radius: 0 6px 6px 0;
      padding: 8px 12px;
      font-size: 12px;
    }
    .msg.plan .plan-title {
      font-weight: 600;
      font-size: 10.5px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 4px;
    }
    .msg.plan ol { margin: 0 0 0 16px; }
    .msg.plan li { margin: 2px 0; }

    /* Reasoning (collapsed by default) */
    .row.reasoning .body { color: var(--dim); font-style: italic; white-space: pre-wrap; padding: 4px 0; font-family: var(--vscode-font-family); }

    /* Errors */
    .msg.error {
      align-self: stretch;
      background: var(--vscode-inputValidation-errorBackground, rgba(90,29,29,0.5));
      color: var(--vscode-errorForeground, #f48771);
      border-left: 3px solid var(--vscode-errorForeground, #f48771);
      border-radius: 0 6px 6px 0;
      padding: 7px 10px;
      font-size: 12px;
    }

    .msg.notice {
      align-self: center;
      color: var(--dim);
      font-size: 11px;
    }

    /* Live status line — lives INSIDE the transcript, under the last message */
    #status {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
      color: var(--dim);
      font-size: 11.5px;
      flex-shrink: 0;
    }
    #status.active { display: flex; }
    .spinner {
      width: 10px; height: 10px;
      border: 1.5px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #status .status-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-style: italic;
    }

    /* Code blocks with Copilot-style action header */
    .codeblock {
      margin: 8px 0;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    .codeblock pre { margin: 0 !important; border: none !important; border-radius: 0 !important; }
    .cb-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--code-bg);
      border-bottom: 1px solid var(--border);
      padding: 3px 8px;
      font-family: var(--vscode-editor-font-family);
      font-size: 10px;
      color: var(--dim);
    }
    .cb-actions { display: flex; gap: 2px; }
    .cb-btn {
      background: none;
      border: none;
      color: var(--dim);
      cursor: pointer;
      font-size: 10px;
      font-family: inherit;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .cb-btn:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }

    /* ── Composer ─────────────────────────────────────────────── */
    #composer {
      position: relative;
      flex-shrink: 0;
      border-top: 1px solid var(--border);
      padding: 10px 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: var(--vscode-sideBar-background);
    }

    /* Slash-command + picker menus */
    #slash-menu, #picker-menu {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 12px;
      right: 12px;
      margin-bottom: 4px;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      overflow: hidden;
      z-index: 10;
      max-height: 260px;
      overflow-y: auto;
    }
    #slash-menu.open, #picker-menu.open { display: block; }
    .sm-item {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 5px 12px;
      cursor: pointer;
      font-size: 12px;
    }
    .sm-item.sel, .sm-item:hover {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .sm-cmd { font-family: var(--vscode-editor-font-family); font-weight: 600; flex-shrink: 0; }
    .sm-desc { color: var(--dim); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sm-item.sel .sm-desc, .sm-item:hover .sm-desc { color: inherit; opacity: 0.8; }

    /* Implicit-context pills */
    #context-pills { display: flex; flex-wrap: wrap; gap: 5px; }
    #context-pills:empty { display: none; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
      border: 1px solid var(--border);
      background: var(--code-bg);
      border-radius: 20px;
      padding: 1px 8px;
      font-size: 10.5px;
      color: var(--dim);
      font-family: var(--vscode-editor-font-family);
    }
    .pill .pill-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pill .x { cursor: pointer; opacity: 0.6; font-size: 12px; line-height: 1; }
    .pill .x:hover { opacity: 1; }
    #input-shell {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      border: 1px solid var(--vscode-input-border, var(--border));
      background: var(--vscode-input-background);
      border-radius: 10px;
      padding: 6px 6px 6px 12px;
      transition: border-color 0.1s;
    }
    #input-shell:focus-within { border-color: var(--vscode-focusBorder); }
    #task-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      color: var(--vscode-input-foreground);
      font-family: inherit;
      font-size: 12.5px;
      resize: none;
      min-height: 20px;
      max-height: 140px;
      line-height: 1.5;
      padding: 2px 0;
    }
    #send-btn {
      width: 26px; height: 26px;
      border: none;
      border-radius: 7px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.1s;
    }
    #send-btn:hover { opacity: 0.9; }
    #send-btn:disabled { opacity: 0.4; cursor: default; }
    #send-btn svg { width: 13px; height: 13px; }
    #send-btn.stop { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); color: var(--vscode-errorForeground, #f48771); }

    #meta-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: var(--dim);
      padding: 0 2px;
      min-height: 13px;
    }
    .meta-left { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .badge-btn {
      background: none;
      border: 1px solid transparent;
      color: var(--dim);
      font-family: var(--vscode-editor-font-family);
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
      cursor: pointer;
      max-width: 46vw;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .badge-btn:hover { border-color: var(--border); color: var(--vscode-foreground); background: var(--code-bg); }
    #mode-badge { color: var(--accent); flex-shrink: 0; }
    #token-counter { flex-shrink: 0; }
  </style>
</head>
<body>
  <div id="messages"><div id="welcome">
    <div class="logo">⬡</div>
    <div class="title">Crayon</div>
    <div class="hint">Autonomous coding agent. Describe a task — Crayon plans, edits files, runs commands, and verifies with tests.</div>
    <div class="hint"><kbd>⏎</kbd> send &nbsp;·&nbsp; <kbd>⇧⏎</kbd> newline</div>
  </div><div id="status"><div class="spinner"></div><span class="status-text"></span></div></div>
  <div id="composer">
    <div id="slash-menu"></div>
    <div id="picker-menu"></div>
    <div id="context-pills"></div>
    <div id="input-shell">
      <textarea id="task-input" placeholder="Ask Crayon to build, fix, or refactor…" rows="1"></textarea>
      <button id="send-btn" title="Send (⏎)">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.72 1.05a.5.5 0 0 0-.71.55l1.4 5.4L9 8 2.41 9l-1.4 5.4a.5.5 0 0 0 .71.55l13-6.5a.5.5 0 0 0 0-.9l-13-6.5z"/></svg>
      </button>
    </div>
    <div id="meta-line">
      <div class="meta-left">
        <button id="mode-badge" class="badge-btn" title="Permission mode — click to change"></button>
        <button id="model-badge" class="badge-btn" title="Model — click to change"></button>
      </div>
      <span id="token-counter"></span>
    </div>
  </div>
  <script nonce="${nonce}" src="${webviewScriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
