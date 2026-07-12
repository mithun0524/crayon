import * as assert from "assert";
import * as vscode from "vscode";

// publisher.name from package.json
const EXT_ID = "crayon.crayon-vscode";

describe("Crayon extension — smoke", () => {
  it("is installed and activates without throwing", async () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} not found`);
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true, "extension did not activate");
  });

  it("registers all contributed commands", async () => {
    const cmds = await vscode.commands.getCommands(true);
    for (const c of [
      "crayon.chat",
      "crayon.runTask",
      "crayon.indexWorkspace",
      "crayon.setApiKey",
      "crayon.clearChat",
    ]) {
      assert.ok(cmds.includes(c), `command not registered: ${c}`);
    }
  });

  it("ships the expected configuration defaults", () => {
    const cfg = vscode.workspace.getConfiguration("crayon");
    assert.strictEqual(cfg.get("provider"), "anthropic");
    assert.strictEqual(cfg.get("defaultModel"), "claude-sonnet-4-6");
    assert.strictEqual(cfg.get("permissionMode"), "auto-edit");
  });

  it("opens the chat view without throwing", async () => {
    // Just needs to resolve the webview without an exception — no task is run.
    await vscode.commands.executeCommand("crayon.chat");
  });
});
