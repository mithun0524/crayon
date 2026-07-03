import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTools } from "./index.js";
import type { ToolContext } from "../types.js";

// Minimal indexer stub — the file tools under test never touch it.
const fakeIndexer = {
  search: async () => [],
  getGraph: () => ({ getDependents: () => [], getDependencies: () => [] }),
} as any;

function makeCtx(root: string): ToolContext {
  return {
    workspaceRoot: root,
    indexer: fakeIndexer,
    permissionMode: "bypass", // auto-approve edits
  };
}

describe("file tools", () => {
  let root: string;

  beforeEach(async () => {
    // realpath: resolvePath canonicalizes symlinks (e.g. macOS /var -> /private/var),
    // so the workspace root must be canonical too or every path looks like an escape.
    root = realpathSync(await mkdtemp(path.join(os.tmpdir(), "crayon-tools-")));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("blocks reads that escape the workspace", async () => {
    const tools = createTools(makeCtx(root));
    await expect(tools.read_file.execute({ path: "../../etc/passwd" })).rejects.toThrow(/escapes workspace/i);
  });

  it("edit_file replaces a unique occurrence and writes to disk", async () => {
    await writeFile(path.join(root, "f.ts"), "const a = 1;\nconst b = 2;\n", "utf-8");
    const tools = createTools(makeCtx(root));
    const res: any = await tools.edit_file.execute({
      path: "f.ts",
      old_string: "const a = 1;",
      new_string: "const a = 42;",
    });
    expect(res.success).toBe(true);
    expect(await readFile(path.join(root, "f.ts"), "utf-8")).toContain("const a = 42;");
  });

  it("edit_file fails when old_string is not found", async () => {
    await writeFile(path.join(root, "f.ts"), "hello", "utf-8");
    const tools = createTools(makeCtx(root));
    const res: any = await tools.edit_file.execute({
      path: "f.ts",
      old_string: "goodbye",
      new_string: "x",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });

  it("edit_file fails when old_string is ambiguous (multiple matches)", async () => {
    await writeFile(path.join(root, "f.ts"), "x\nx\n", "utf-8");
    const tools = createTools(makeCtx(root));
    const res: any = await tools.edit_file.execute({
      path: "f.ts",
      old_string: "x",
      new_string: "y",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/found 2 times|unique/i);
  });

  it("write_file refuses to overwrite an existing file", async () => {
    await writeFile(path.join(root, "exists.ts"), "old", "utf-8");
    const tools = createTools(makeCtx(root));
    const res: any = await tools.write_file.execute({ path: "exists.ts", content: "new" });
    expect(res.success).toBe(false);
    expect(await readFile(path.join(root, "exists.ts"), "utf-8")).toBe("old");
  });

  it("write_file creates a new file", async () => {
    const tools = createTools(makeCtx(root));
    const res: any = await tools.write_file.execute({ path: "sub/created.ts", content: "hi" });
    expect(res.success).toBe(true);
    expect(existsSync(path.join(root, "sub/created.ts"))).toBe(true);
  });

  it("disables spawn_agent when allowSubagents is false", () => {
    const withSub = createTools(makeCtx(root));
    expect("spawn_agent" in withSub).toBe(true);
    const noSub = createTools({ ...makeCtx(root), allowSubagents: false });
    expect("spawn_agent" in noSub).toBe(false);
  });
});
