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

  it("edit_file falls back to a whitespace-tolerant match (weak-model indentation)", async () => {
    await writeFile(path.join(root, "f.ts"), "function x() {\n      return a-b;\n}\n", "utf-8");
    const tools = createTools(makeCtx(root));
    // Model supplies the line with different indentation than the file.
    const res: any = await tools.edit_file.execute({
      path: "f.ts",
      old_string: "return a-b;",
      new_string: "  return a+b;",
    });
    expect(res.success).toBe(true);
    const out = await readFile(path.join(root, "f.ts"), "utf-8");
    expect(out).toContain("return a+b;");
    expect(out).not.toContain("a-b");
  });

  it("edit_file fuzzy matches a whitespace-variant substring ('a - b' vs 'a-b')", async () => {
    await writeFile(path.join(root, "m.js"), "export function add(a,b){return a-b;}\n", "utf-8");
    const tools = createTools(makeCtx(root));
    const res: any = await tools.edit_file.execute({ path: "m.js", old_string: "a - b", new_string: "a + b" });
    expect(res.success).toBe(true);
    expect(await readFile(path.join(root, "m.js"), "utf-8")).toContain("return a + b;");
  });

  it("edit_file fuzzy fallback refuses when the block is ambiguous", async () => {
    await writeFile(path.join(root, "f.ts"), "  x\n  x\n", "utf-8");
    const tools = createTools(makeCtx(root));
    const res: any = await tools.edit_file.execute({ path: "f.ts", old_string: "x", new_string: "y" });
    expect(res.success).toBe(false); // 2 exact matches → ambiguous, not fuzzy-applied
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

  it("edit_file surfaces a warning when the fuzzy path is used", async () => {
    await writeFile(path.join(root, "m.js"), "let v = a-b;\n", "utf-8");
    const tools = createTools(makeCtx(root));
    const res: any = await tools.edit_file.execute({ path: "m.js", old_string: "a - b", new_string: "a + b" });
    expect(res.success).toBe(true);
    expect(res.warning).toMatch(/whitespace-insensitive/i);
  });

  it("edit_file refuses a too-short fuzzy needle (mis-target guard)", async () => {
    await writeFile(path.join(root, "f.ts"), "const zz = 1;\n", "utf-8");
    const tools = createTools(makeCtx(root));
    // "z z" strips to "zz" (2 chars) — below the min fuzzy length, so refuse.
    const res: any = await tools.edit_file.execute({ path: "f.ts", old_string: "z z", new_string: "qq" });
    expect(res.success).toBe(false);
    expect(await readFile(path.join(root, "f.ts"), "utf-8")).toContain("zz");
  });

  it("multi_edit applies multiple edits atomically", async () => {
    await writeFile(path.join(root, "f.ts"), "const a = 1;\nconst b = 2;\nconst c = 3;\n", "utf-8");
    const tools = createTools(makeCtx(root));
    const res: any = await tools.multi_edit.execute({
      path: "f.ts",
      edits: [
        { old_string: "const a = 1;", new_string: "const a = 10;" },
        { old_string: "const c = 3;", new_string: "const c = 30;" },
      ],
    });
    expect(res.success).toBe(true);
    expect(res.editsApplied).toBe(2);
    const out = await readFile(path.join(root, "f.ts"), "utf-8");
    expect(out).toContain("const a = 10;");
    expect(out).toContain("const c = 30;");
    expect(out).toContain("const b = 2;");
  });

  it("multi_edit writes nothing if any edit fails (atomic)", async () => {
    await writeFile(path.join(root, "f.ts"), "const a = 1;\nconst b = 2;\n", "utf-8");
    const tools = createTools(makeCtx(root));
    const res: any = await tools.multi_edit.execute({
      path: "f.ts",
      edits: [
        { old_string: "const a = 1;", new_string: "const a = 10;" }, // ok
        { old_string: "not present anywhere", new_string: "x" }, // fails
      ],
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/edit #2/);
    // First edit must NOT have been written — the file is untouched.
    expect(await readFile(path.join(root, "f.ts"), "utf-8")).toBe("const a = 1;\nconst b = 2;\n");
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
