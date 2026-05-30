import * as vscode from "vscode";
import { CrayonAgent, type AgentEvent } from "@crayon/agent";
import { getEditorContext } from "../bridge.js";

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
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

    webviewView.webview.onDidReceiveMessage(async (message: { type: string; task?: string }) => {
      if (message.type === "run" && message.task) {
        await this.handleRun(message.task);
      }
    });
  }

  postEvent(event: AgentEvent): void {
    this.view?.webview.postMessage({ type: "event", event });
  }

  private async handleRun(task: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
      this.postEvent({ type: "error", message: "Open a workspace folder first" });
      return;
    }

    const config = vscode.workspace.getConfiguration("crayon");
    const anthropicApiKey = config.get<string>("anthropicApiKey") || process.env.ANTHROPIC_API_KEY;
    const openaiApiKey = config.get<string>("openaiApiKey") || process.env.OPENAI_API_KEY;
    const openrouterApiKey = config.get<string>("openrouterApiKey") || process.env.OPENROUTER_API_KEY;
    const defaultModel = config.get<string>("defaultModel") || "nvidia/nemotron-3-super-120b-a12b:free";
    const provider = config.get<"openrouter" | "anthropic" | "openai">("provider") || "openrouter";

    if (!anthropicApiKey && !openaiApiKey && !openrouterApiKey) {
      this.postEvent({ type: "error", message: "Set OpenRouter API key in Crayon settings" });
      return;
    }

    const { currentFile, selection } = getEditorContext();

    const agent = new CrayonAgent({
      workspaceRoot: folder,
      model: defaultModel,
      provider,
      anthropicApiKey,
      openaiApiKey,
      openrouterApiKey,
      onEvent: (event) => this.postEvent(event),
      approveCommand: async (command) => {
        const choice = await vscode.window.showWarningMessage(
          `Crayon: ${command}`,
          "Approve",
          "Deny"
        );
        return choice === "Approve";
      },
    });

    try {
      await agent.run(task, { currentFile, selection });
    } catch (err) {
      this.postEvent({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      agent.close();
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Crayon Chat</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .msg {
      padding: 8px 12px;
      border-radius: 6px;
      max-width: 95%;
      word-wrap: break-word;
      white-space: pre-wrap;
      font-size: 13px;
      line-height: 1.4;
    }
    .msg.user {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      align-self: flex-end;
    }
    .msg.agent { background: var(--vscode-editor-inactiveSelectionBackground); align-self: flex-start; }
    .msg.system { background: transparent; color: var(--vscode-descriptionForeground); font-size: 12px; align-self: center; }
    .msg.error { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-errorForeground); }
    .msg.plan { background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); }
    .msg.tool { background: transparent; color: var(--vscode-descriptionForeground); font-size: 11px; font-family: var(--vscode-editor-font-family); }
    #input-area {
      padding: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      gap: 6px;
    }
    #task-input {
      flex: 1;
      padding: 8px 10px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-family: inherit;
      font-size: 13px;
      resize: none;
      min-height: 36px;
      max-height: 120px;
    }
    #send-btn {
      padding: 8px 14px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
    #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .header {
      padding: 10px 12px;
      font-weight: 600;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="header">Crayon Agent</div>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="task-input" placeholder="Ask Crayon to build, fix, or refactor..." rows="1"></textarea>
    <button id="send-btn">Run</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById('messages');
    const input = document.getElementById('task-input');
    const sendBtn = document.getElementById('send-btn');
    let running = false;

    function addMsg(text, cls) {
      const div = document.createElement('div');
      div.className = 'msg ' + cls;
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function send() {
      const task = input.value.trim();
      if (!task || running) return;
      running = true;
      sendBtn.disabled = true;
      addMsg(task, 'user');
      input.value = '';
      vscode.postMessage({ type: 'run', task });
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    window.addEventListener('message', (e) => {
      const { type, event } = e.data;
      if (type !== 'event') return;

      switch (event.type) {
        case 'plan':
          addMsg('Plan:\\n' + event.steps.map((s, i) => (i+1) + '. ' + s).join('\\n'), 'plan');
          break;
        case 'text':
          addMsg(event.content, 'agent');
          break;
        case 'tool_call':
          addMsg('→ ' + event.name, 'tool');
          break;
        case 'edit':
          addMsg('Edited: ' + event.path, 'system');
          break;
        case 'eval':
          addMsg(event.passed ? '✓ Tests passed' : '✗ Tests failed — retrying...', event.passed ? 'system' : 'error');
          break;
        case 'done':
          addMsg(event.summary, 'agent');
          running = false;
          sendBtn.disabled = false;
          break;
        case 'error':
          addMsg(event.message, 'error');
          running = false;
          sendBtn.disabled = false;
          break;
        case 'thinking':
          addMsg(event.content, 'system');
          break;
      }
    });

    addMsg('Ready. Describe a task and Crayon will plan, code, and test autonomously.', 'system');
  </script>
</body>
</html>`;
  }
}
