import * as vscode from "vscode";
import { CodeIndexer } from "crayon-indexer";
import { ChatPanelProvider, API_KEY_SECRETS } from "./panel/chat-provider.js";

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

  chatProvider = new ChatPanelProvider(context, {
    onBusyChange: (busy) => {
      statusBarItem.text = busy ? "$(sync~spin) Crayon running..." : "$(comment-discussion) Crayon";
    },
  });
  context.subscriptions.push(chatProvider);

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
    vscode.window.registerWebviewViewProvider("crayon.chatView", chatProvider, {
      // Keep the webview alive while the sidebar is collapsed so streamed
      // events and transcript survive without a full replay.
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("crayon.chat", () => {
      vscode.commands.executeCommand("crayon.chatView.focus");
    })
  );

  // Single agent path: the palette command routes into the chat panel, so it
  // reuses the same session, history, and streaming UI.
  context.subscriptions.push(
    vscode.commands.registerCommand("crayon.runTask", async () => {
      const task = await vscode.window.showInputBox({
        prompt: "What should Crayon do?",
        placeHolder: "e.g. Fix the failing test in utils.test.ts",
      });
      if (!task) return;
      await vscode.commands.executeCommand("crayon.chatView.focus");
      await chatProvider.submitTask(task);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("crayon.setApiKey", async () => {
      const pick = await vscode.window.showQuickPick(
        Object.keys(API_KEY_SECRETS).map((provider) => ({ label: provider })),
        { placeHolder: "Which provider's API key?" }
      );
      if (!pick) return;
      const key = await vscode.window.showInputBox({
        prompt: `${pick.label} API key (stored in VS Code secret storage, never synced)`,
        password: true,
        ignoreFocusOut: true,
      });
      if (key === undefined) return;
      const secretId = API_KEY_SECRETS[pick.label as keyof typeof API_KEY_SECRETS];
      if (key === "") {
        await context.secrets.delete(secretId);
        vscode.window.showInformationMessage(`Crayon: cleared ${pick.label} API key.`);
      } else {
        await context.secrets.store(secretId, key);
        vscode.window.showInformationMessage(`Crayon: stored ${pick.label} API key securely.`);
      }
      chatProvider.invalidateAgent();
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

function getWorkspaceRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) {
    vscode.window.showErrorMessage("Crayon: Open a workspace folder first");
  }
  return folder;
}

export function deactivate(): void {
  statusBarItem?.dispose();
  chatProvider?.dispose();
}
