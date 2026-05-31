import * as vscode from "vscode";
import { CrayonAgent, type AgentEvent } from "crayon-agent";
import { CodeIndexer } from "crayon-indexer";
import { ChatPanelProvider } from "./panel/chat-provider.js";

let statusBarItem: vscode.StatusBarItem;
let chatProvider: ChatPanelProvider;

const diffProvider = new class implements vscode.TextDocumentContentProvider {
  private contents = new Map<string, string>();
  private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.fsPath) || '';
  }

  setContent(uri: vscode.Uri, content: string) {
    this.contents.set(uri.fsPath, content);
    this.onDidChangeEmitter.fire(uri);
  }
};

export function activate(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(comment-discussion) Crayon";
  statusBarItem.command = "crayon.chat";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  chatProvider = new ChatPanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('crayon-diff', diffProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("crayon.previewEdit", async (absPath: vscode.Uri, previewUri: vscode.Uri, relPath: string, newContent: string) => {
      diffProvider.setContent(previewUri, newContent);

      await vscode.commands.executeCommand(
        "vscode.diff",
        absPath,
        previewUri,
        `Crayon Patched: ${relPath}`,
        { preview: true }
      );

      const choice = await vscode.window.showInformationMessage(
        `Crayon wants to edit ${relPath}. Accept changes?`,
        "Accept",
        "Reject"
      );

      if (vscode.window.activeTextEditor?.document.uri.scheme === 'crayon-diff') {
        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      }

      return choice === "Accept";
    })
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("crayon.chatView", chatProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("crayon.chat", () => {
      vscode.commands.executeCommand("crayon.chatView.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("crayon.runTask", async () => {
      const task = await vscode.window.showInputBox({
        prompt: "What should Crayon do?",
        placeHolder: "e.g. Fix the failing test in utils.test.ts",
      });
      if (!task) return;
      await runAgentTask(task);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("crayon.indexWorkspace", async () => {
      const folder = getWorkspaceRoot();
      if (!folder) return;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Crayon: Indexing workspace" },
        async () => {
          const indexer = new CodeIndexer(folder);
          await indexer.init();
          const stats = await indexer.index(true);
          await indexer.detectIntelligence();
          vscode.window.showInformationMessage(
            `Crayon indexed ${stats.fileCount} files, ${stats.symbolCount} symbols`
          );
        }
      );
    })
  );
}

async function runAgentTask(task: string): Promise<void> {
  const folder = getWorkspaceRoot();
  if (!folder) return;

  const config = vscode.workspace.getConfiguration("crayon");
  const anthropicApiKey = config.get<string>("anthropicApiKey") || process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = config.get<string>("openaiApiKey") || process.env.OPENAI_API_KEY;
  const openrouterApiKey = config.get<string>("openrouterApiKey") || process.env.OPENROUTER_API_KEY;
  const googleApiKey = config.get<string>("googleApiKey") || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const defaultModel = config.get<string>("defaultModel") || "nvidia/nemotron-3-super-120b-a12b:free";
  const provider = config.get<"openrouter" | "anthropic" | "openai" | "google">("provider") || "openrouter";
  const autoApplyEdits = config.get<boolean>("autoApplyEdits") ?? true;

  if (!anthropicApiKey && !openaiApiKey && !openrouterApiKey && !googleApiKey) {
    vscode.window.showErrorMessage(
      "Crayon: Set crayon.openrouterApiKey or OPENROUTER_API_KEY in settings"
    );
    return;
  }

  const editor = vscode.window.activeTextEditor;
  const currentFile = editor?.document.uri.fsPath
    ? vscode.workspace.asRelativePath(editor.document.uri)
    : undefined;
  const selection = editor?.document.getText(editor.selection) || undefined;

  statusBarItem.text = "$(sync~spin) Crayon running...";

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Crayon",
      cancellable: false,
    },
    async (progress) => {
      const agent = new CrayonAgent({
        workspaceRoot: folder,
        model: defaultModel,
        provider,
        anthropicApiKey,
        openaiApiKey,
        openrouterApiKey,
        googleApiKey,
        onEvent: (event: AgentEvent) => {
          chatProvider.postEvent(event);
          switch (event.type) {
            case "plan":
              progress.report({ message: `Planning: ${event.steps.length} steps` });
              break;
            case "tool_call":
              progress.report({ message: `Tool: ${event.name}` });
              break;
            case "edit":
              progress.report({ message: `Editing: ${event.path}` });
              break;
            case "eval":
              progress.report({ message: event.passed ? "Tests passed" : "Self-healing..." });
              break;
            case "done":
              progress.report({ message: "Done" });
              break;
          }
        },
        approveCommand: async (command: string) => {
          const choice = await vscode.window.showWarningMessage(
            `Crayon wants to run: ${command}`,
            { modal: true },
            "Approve",
            "Deny"
          );
          return choice === "Approve";
        },
        approveEdit: autoApplyEdits
          ? async () => true
          : async (relPath: string, newContent: string) => {
              const absPath = vscode.Uri.joinPath(vscode.Uri.file(folder), relPath);
              const previewUri = vscode.Uri.parse(`crayon-diff:${absPath.fsPath}`);
              return await vscode.commands.executeCommand<boolean>("crayon.previewEdit", absPath, previewUri, relPath, newContent) ?? false;
            },
      });

      try {
        const result = await agent.run(task, { currentFile, selection });
        if (result.success) {
          vscode.window.showInformationMessage(`Crayon: ${result.summary.slice(0, 100)}`);
        } else {
          vscode.window.showWarningMessage(`Crayon finished with issues: ${result.summary.slice(0, 100)}`);
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `Crayon failed: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        agent.close();
        statusBarItem.text = "$(comment-discussion) Crayon";
      }
    }
  );
}

function getWorkspaceRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) {
    vscode.window.showErrorMessage("Crayon: Open a workspace folder first");
  }
  return folder;
}

export function deactivate(): void {
  statusBarItem?.dispose();
}
