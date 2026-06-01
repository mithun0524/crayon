import * as vscode from "vscode";
import { CrayonAgent, type AgentEvent } from "crayon-agent";
import { getEditorContext } from "../bridge.js";

/**
 * ChatPanelProvider — persistent agent session with real-time streaming.
 *
 * Key changes vs Phase 1:
 * - Agent is created once per workspace and reused (persistent history + episodic memory)
 * - Handles text_delta events for real-time token streaming
 * - Respects crayon.autoApplyEdits setting
 * - Improved webview UI with markdown, collapsible tool calls, streaming animation
 */
export class ChatPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private agent?: CrayonAgent;
  private agentWorkspaceRoot?: string;

  constructor(
    private readonly extensionUri: vscode.Uri
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message: { type: string; task?: string; path?: string }) => {
      if (message.type === "run" && message.task) {
        await this.handleRun(message.task);
      } else if (message.type === "stop") {
        this.stopAgent();
      } else if (message.type === "clear") {
        this.agent?.clearHistory();
        this.view?.webview.postMessage({ type: "cleared" });
      } else if (message.type === "open_file" && message.path) {
        if (this.agentWorkspaceRoot) {
          const fileUri = vscode.Uri.joinPath(vscode.Uri.file(this.agentWorkspaceRoot), message.path);
          vscode.workspace.openTextDocument(fileUri).then((doc) => {
            vscode.window.showTextDocument(doc, { preview: false });
          });
        }
      }
    });

    // Dispose agent when panel is hidden/closed
    webviewView.onDidDispose(() => {
      this.agent?.close();
      this.agent = undefined;
    });
  }

  postEvent(event: AgentEvent): void {
    this.view?.webview.postMessage({ type: "event", event });
  }

  private stopAgent(): void {
    this.agent?.close();
    this.agent = undefined;
    this.postEvent({ type: "error", message: "Agent stopped." });
  }

  private getOrCreateAgent(folder: string): CrayonAgent {
    // Reuse agent if same workspace (preserves history + episodic memory)
    if (this.agent && this.agentWorkspaceRoot === folder) {
      return this.agent;
    }

    // Close old agent if workspace changed
    this.agent?.close();

    const config = vscode.workspace.getConfiguration("crayon");
    const anthropicApiKey = config.get<string>("anthropicApiKey") || process.env.ANTHROPIC_API_KEY;
    const openaiApiKey = config.get<string>("openaiApiKey") || process.env.OPENAI_API_KEY;
    const openrouterApiKey = config.get<string>("openrouterApiKey") || process.env.OPENROUTER_API_KEY;
    const googleApiKey = config.get<string>("googleApiKey") || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const defaultModel = config.get<string>("defaultModel") || "nvidia/nemotron-3-super-120b-a12b:free";
    const provider = config.get<"openrouter" | "anthropic" | "openai" | "google">("provider") || "openrouter";
    const autoApplyEdits = config.get<boolean>("autoApplyEdits") ?? true;

    this.agent = new CrayonAgent({
      workspaceRoot: folder,
      model: defaultModel,
      provider,
      anthropicApiKey,
      openaiApiKey,
      openrouterApiKey,
      googleApiKey,
      onEvent: (event) => this.postEvent(event),
      approveCommand: async (command) => {
        const choice = await vscode.window.showWarningMessage(
          `Crayon: ${command}`,
          "Approve",
          "Deny"
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
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      this.postEvent({ type: "error", message: "Open a workspace folder first" });
      return;
    }

    const config = vscode.workspace.getConfiguration("crayon");
    const hasAnyKey =
      config.get<string>("anthropicApiKey") ||
      config.get<string>("openaiApiKey") ||
      config.get<string>("openrouterApiKey") ||
      config.get<string>("googleApiKey") ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!hasAnyKey) {
      this.postEvent({ type: "error", message: "Set an API key in Crayon settings (e.g. crayon.openrouterApiKey)" });
      return;
    }

    const { currentFile, selection } = getEditorContext();
    const agent = this.getOrCreateAgent(folder);

    try {
      await agent.run(task, { currentFile, selection });
    } catch (err) {
      this.postEvent({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private getHtml(): string {
    const nonce = getNonce();
    const webviewScriptUri = this.view?.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
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
