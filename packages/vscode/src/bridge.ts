import * as vscode from "vscode";

export function getEditorContext(): { currentFile?: string; selection?: string } {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};

  return {
    currentFile: vscode.workspace.asRelativePath(editor.document.uri),
    selection: editor.document.getText(editor.selection) || undefined,
  };
}
