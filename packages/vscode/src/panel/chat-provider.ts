import * as path from "node:path";
import * as vscode from "vscode";
import { CrayonAgent, type AgentEvent } from "crayon-agent";
import { getEditorContext } from "../bridge.js";

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
      const msg = message as { type?: unknown; task?: unknown; path?: unknown };
      switch (msg.type) {
        case "ready":
          this.replayTranscript();
          break;
        case "run":
          if (typeof msg.task === "string" && msg.task.trim()) {
            await this.handleRun(msg.task);
          }
          break;
        case "stop":
          this.stopCurrentRun();
          break;
        case "clear":
          this.agent?.clearHistory();
          this.transcript = [];
          void this.persistTranscript();
          this.view?.webview.postMessage({ type: "cleared" });
          break;
        case "open_file":
          if (typeof msg.path === "string") this.openWorkspaceFile(msg.path);
          break;
      }
    });

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

  /** Drop the cached agent so new settings/keys apply on the next run. */
  invalidateAgent(): void {
    if (this.running) return; // don't yank it mid-run; next run rebuilds
    this.agent?.close();
    this.agent = undefined;
    this.agentWorkspaceRoot = undefined;
  }

  private postEvent(event: AgentEvent): void {
    // text_delta is streaming sugar — the final "text" event carries the full
    // content, so deltas are not recorded for replay.
    if (event.type !== "text_delta") {
      this.pushTranscript({ kind: "event", event });
    }
    this.postToWebview({ type: "event", event });
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

  private openWorkspaceFile(relPath: string): void {
    const root = this.agentWorkspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;
    // Reject traversal outside the workspace
    const abs = path.resolve(root, relPath);
    if (abs !== root && !abs.startsWith(root + path.sep)) return;
    vscode.workspace.openTextDocument(vscode.Uri.file(abs)).then((doc) => {
      vscode.window.showTextDocument(doc, { preview: false });
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
    const defaultModel = config.get<string>("defaultModel") || "nvidia/nemotron-3-super-120b-a12b:free";
    const provider = config.get<"openrouter" | "anthropic" | "openai" | "google">("provider") || "openrouter";
    const autoApplyEdits = config.get<boolean>("autoApplyEdits") ?? true;

    this.agent = new CrayonAgent({
      workspaceRoot: folder,
      model: defaultModel,
      provider,
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
      approveEdit: autoApplyEdits
        ? async () => true
        : async (relPath, newContent) => {
            const absPath = vscode.Uri.joinPath(vscode.Uri.file(folder), relPath);
            const previewUri = vscode.Uri.parse(`crayon-diff:${absPath.fsPath}`);
            return await vscode.commands.executeCommand<boolean>("crayon.previewEdit", absPath, previewUri, relPath, newContent) ?? false;
          },
    });

    this.agentWorkspaceRoot = folder;
    return this.agent;
  }

  private async handleRun(task: string): Promise<void> {
    if (this.running) {
      this.postToWebview({ type: "event", event: { type: "error", message: "A run is already in progress — stop it first." } });
      return;
    }

    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      this.postEvent({ type: "error", message: "Open a workspace folder first" } as AgentEvent);
      return;
    }

    const keys = await this.getApiKeys();
    if (!Object.values(keys).some(Boolean)) {
      this.postEvent({
        type: "error",
        message: "No API key found. Run “Crayon: Set API Key” from the command palette.",
      } as AgentEvent);
      return;
    }

    this.pushTranscript({ kind: "user", task });

    const { currentFile, selection } = getEditorContext();
    const agent = await this.getOrCreateAgent(folder);

    this.running = true;
    this.runAbort = new AbortController();
    this.hooks.onBusyChange?.(true);
    this.postToWebview({ type: "run_state", running: true });

    try {
      await agent.run(task, { currentFile, selection, signal: this.runAbort.signal });
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

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .header {
      padding: 10px 12px;
      font-weight: 600;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .header-actions {
      display: flex;
      gap: 6px;
    }

    .icon-btn {
      background: none;
      border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 11px;
      opacity: 0.7;
    }
    .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .msg {
      padding: 8px 12px;
      border-radius: 6px;
      max-width: 97%;
      word-wrap: break-word;
      font-size: 12.5px;
      line-height: 1.5;
    }

    .msg pre {
      background: var(--vscode-editor-background);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .msg code {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }

    .msg p { margin-bottom: 8px; }
    .msg p:last-child { margin-bottom: 0; }

    .msg.user {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      align-self: flex-end;
      border-radius: 12px 12px 2px 12px;
      white-space: pre-wrap;
    }

    .msg.agent {
      background: var(--vscode-editor-inactiveSelectionBackground);
      align-self: flex-start;
      border-radius: 2px 12px 12px 12px;
    }

    .msg.agent.streaming::after {
      content: '▋';
      animation: blink 0.8s step-end infinite;
      color: var(--vscode-textLink-foreground);
      margin-left: 2px;
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    .msg.system {
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      align-self: center;
      text-align: center;
    }

    .msg.error {
      background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      color: var(--vscode-errorForeground, #f48771);
      border-left: 3px solid var(--vscode-errorForeground, #f48771);
    }

    .msg.plan {
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textLink-foreground);
      font-size: 12px;
    }
    .msg.plan ol { margin: 4px 0 0 16px; }
    .msg.plan li { margin: 2px 0; }

    .msg.tool {
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-family: var(--vscode-editor-font-family);
      align-self: flex-start;
      padding: 2px 12px;
    }

    .tool-call summary {
      cursor: pointer;
      color: var(--vscode-textLink-foreground);
      user-select: none;
    }

    .tool-call pre {
      margin-top: 4px;
      font-size: 10px;
      background: var(--vscode-editor-background);
      max-height: 200px;
      overflow-y: auto;
    }

    .msg.edit {
      background: transparent;
      font-size: 11px;
      align-self: flex-start;
      padding: 2px 12px;
    }

    .file-link {
      color: var(--vscode-gitDecoration-modifiedResourceForeground, #73c991);
      text-decoration: none;
      cursor: pointer;
    }
    .file-link:hover { text-decoration: underline; }

    .msg.eval-pass {
      color: var(--vscode-testing-iconPassed, #73c991);
      background: transparent;
      font-size: 11px;
      align-self: center;
    }

    .msg.eval-fail {
      color: var(--vscode-testing-iconFailed, #f48771);
      background: transparent;
      font-size: 11px;
      align-self: center;
    }

    #input-area {
      padding: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    #task-input {
      flex: 1;
      padding: 7px 10px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-family: inherit;
      font-size: 12.5px;
      resize: none;
      min-height: 34px;
      max-height: 120px;
      line-height: 1.4;
    }
    #task-input:focus { outline: 1px solid var(--vscode-focusBorder); }

    #send-btn {
      padding: 7px 13px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      align-self: flex-end;
      min-width: 42px;
    }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    #send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    #send-btn.stop { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); }

    #token-counter {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      font-weight: normal;
    }
  </style>
</head>
<body>
  <div class="header">
    <span>⬡ Crayon <span id="token-counter"></span></span>
    <div class="header-actions">
      <button class="icon-btn" id="clear-btn" title="Clear conversation">Clear</button>
    </div>
  </div>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="task-input" placeholder="Ask Crayon to build, fix, or refactor..." rows="1"></textarea>
    <button id="send-btn">Run</button>
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
