import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createTools } from "./index.js";
import { ensureCrayonDir } from "../services/crayonDir.js";

const fakeIndexer = { search: async () => [], getGraph: () => ({ getDependents: () => [], getDependencies: () => [] }) } as any;

describe("terminal + workspace hygiene", () => {
  let root: string;
  beforeEach(async () => { root = realpathSync(await mkdtemp(path.join(os.tmpdir(), "crayon-term-"))); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  // Regression: node-pty 1.1.0 ships spawn-helper non-executable on macOS, which
  // made EVERY command fail with "posix_spawnp failed".
  it("actually runs a command and reports its exit code", async () => {
    const tools = createTools({ workspaceRoot: root, indexer: fakeIndexer, permissionMode: "bypass" });
    const ok: any = await tools.terminal.execute({ command: "echo crayon-ok" });
    expect(ok.success).toBe(true);
    expect(ok.stdout).toContain("crayon-ok");
    const bad: any = await tools.terminal.execute({ command: "exit 3" });
    expect(bad.success).toBe(false);
    expect(bad.exitCode).toBe(3);
  });

  it("todo scratchpad lives in .crayon/ and .crayon/ ignores itself except commands/", async () => {
    execSync("git init -q", { cwd: root });
    const tools = createTools({ workspaceRoot: root, indexer: fakeIndexer, permissionMode: "bypass" });
    const res: any = await tools.todo.execute({ content: "- [ ] x" });
    expect(res.path).toBe(path.join(".crayon", "todo.md"));
    expect(await readFile(path.join(root, ".crayon", "todo.md"), "utf-8")).toBe("- [ ] x");
    await ensureCrayonDir(root);
    const status = execSync("git status --porcelain --untracked-files=all", { cwd: root, encoding: "utf-8" });
    expect(status).toBe(""); // nothing under .crayon/ shows up, not even the ignore file
    execSync("mkdir -p .crayon/commands && touch .crayon/commands/review.md", { cwd: root });
    const after = execSync("git status --porcelain --untracked-files=all", { cwd: root, encoding: "utf-8" });
    expect(after).toContain(".crayon/commands/review.md");
  });
});

describe("pricing", () => {
  it("never charges for Ollama models, local or cloud", async () => {
    const { getModelPricing } = await import("../index.js");
    expect(getModelPricing("gemma4:31b-cloud", "ollama")).toEqual({ input: 0, output: 0 });
    expect(getModelPricing("claude-sonnet-5", "anthropic").input).toBeGreaterThan(0);
  });
});

describe("auto mode: safe verification commands", () => {
  it("allows read-only git and test runs, blocks their code-executing forms", async () => {
    const { isSafeInvocation } = await import("./index.js");
    for (const ok of ["git status", "git diff --stat", "git log --oneline -5", "node --test", "node --test test/a.test.js", "make test", "find . -name *.ts"]) {
      expect(isSafeInvocation(ok.split(" ")), ok).toBe(true);
    }
    for (const bad of ["git push", "git -c core.pager=sh status", "git diff --output=x", "git diff --ext-diff", "node x.js", "node -e 1",
      "node --test --require ./x.js", "node --test --import=./x.mjs", "node --test --test-reporter=./r.mjs", "make", "make install",
      "find . -delete", "find . -exec rm {} ;", "cd src"]) {
      expect(isSafeInvocation(bad.split(" ")), bad).toBe(false);
    }
  });

  let root: string;
  beforeEach(async () => { root = realpathSync(await mkdtemp(path.join(os.tmpdir(), "crayon-auto-"))); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("runs `node --test` without an approver, still denies `node -e`", async () => {
    const tools = createTools({ workspaceRoot: root, indexer: fakeIndexer, permissionMode: "auto" });
    const test: any = await tools.terminal.execute({ command: "node --test" });
    expect(test.error).not.toBe("PERMISSION_DENIED_BY_USER");
    const evil: any = await tools.terminal.execute({ command: "node -e 1" });
    expect(evil.error).toBe("PERMISSION_DENIED_BY_USER");
    const chained: any = await tools.terminal.execute({ command: "git status && rm -rf x" });
    expect(chained.error).toBe("PERMISSION_DENIED_BY_USER");
    const outside: any = await tools.terminal.execute({ command: "find / -name passwd" });
    expect(outside.error).toBe("PERMISSION_DENIED_BY_USER");
  });
});

describe("follow-up grounding", () => {
  it("drops suggestions naming files the repo doesn't have", async () => {
    const { groundSuggestions } = await import("../services/suggestions.js");
    const files = ["package.json", "src/cart.js", "test/cart.test.js"];
    expect(groundSuggestions(["Read the README.md file", "Write more tests for cart.js", "Run the tests", "Refactor src/cart.js"], files))
      .toEqual(["Write more tests for cart.js", "Run the tests", "Refactor src/cart.js"]);
    expect(groundSuggestions(["Read README.md"], [])).toEqual(["Read README.md"]);
  });
});
