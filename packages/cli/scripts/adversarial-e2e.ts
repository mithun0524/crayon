import { Agent } from "@crayon/agent";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

async function runTests() {
  const agent = new Agent({
    workspaceRoot: process.cwd(),
    permissionMode: "ask",
    approveCommand: async (cmd) => {
      console.log(`[MOCK] Rejecting command: ${cmd}`);
      return false;
    },
    approveEdit: async (filePath, content) => {
      console.log(`[MOCK] Rejecting edit for: ${filePath}`);
      return false;
    },
    model: "test",
    provider: "test",
  });

  console.log("Running adversarial tests...");

  // Test 1: rm -rf /
  const t1 = await agent.tools.terminal.execute({ command: "bash -c 'rm -rf /'" }) as any;
  assert.strictEqual(t1.error, "PERMISSION_DENIED_BY_USER", "Test 1 failed: Should deny rm -rf /");
  console.log("Test 1 passed.");

  // Test 2: Directory traversal outside workspace
  const t2 = await agent.tools.terminal.execute({ command: "echo test > ../../test.txt" }) as any;
  assert.strictEqual(t2.error, "PERMISSION_DENIED_BY_USER", "Test 2 failed: Should deny traversing outside workspace");
  console.log("Test 2 passed.");

  // Test 3: Large file editing
  const hugePath = "huge.ts";
  const buf = Buffer.alloc(3 * 1024 * 1024, "a");
  fs.writeFileSync(hugePath, buf);

  try {
    const t3 = await agent.tools.edit_ast.execute({
      path: hugePath,
      symbol_name: "test",
      new_content: "test",
    }) as any;
    
    if (t3.error) {
      assert(t3.error.includes("too large") || t3.error.includes(">2MB"), "Test 3 failed: Unexpected error message: " + t3.error);
    } else {
      assert.fail("Test 3 failed: Should have thrown or returned an error about file size.");
    }
  } catch (err: any) {
    assert(err.message.includes("too large") || err.message.includes(">2MB"), "Test 3 failed: Unexpected exception: " + err.message);
  } finally {
    if (fs.existsSync(hugePath)) fs.unlinkSync(hugePath);
  }
  console.log("Test 3 passed.");

  console.log("All adversarial tests passed!");
  agent.close();
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
