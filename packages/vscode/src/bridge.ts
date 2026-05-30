import * as vscode from "vscode";
import { CrayonAgent, type AgentEvent } from "@crayon/agent";

export class AgentBridge {
  private agent: CrayonAgent | null = null;

  async runTask(
    task: string,
    workspaceRoot: string,
    options: {
      model?: string;
      anthropicApiKey?: string;
      openaiApiKey?: string;
      currentFile?: string;
      selection?: string;
      onEvent?: (event: AgentEvent) => void;
      approveCommand?: (command: string) => Promise<boolean>;
    }
  ) {
    this.agent = new CrayonAgent({
      workspaceRoot,
      model: options.model,
      anthropicApiKey: options.anthropicApiKey,
      openaiApiKey: options.openaiApiKey,
      onEvent: options.onEvent,
      approveCommand: options.approveCommand,
    });

    try {
      return await this.agent.run(task, {
        currentFile: options.currentFile,
        selection: options.selection,
      });
    } finally {
      this.agent.close();
      this.agent = null;
    }
  }

  cancel(): void {
    this.agent?.close();
    this.agent = null;
  }
}

export function getEditorContext(): { currentFile?: string; selection?: string } {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};

  return {
    currentFile: vscode.workspace.asRelativePath(editor.document.uri),
    selection: editor.document.getText(editor.selection) || undefined,
  };
}
