import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import { createMemoryTool } from "./memory.js";
import { CodeIndexer } from "crayon-indexer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "crayon-memory-test-"));

  // Minimal git repo so detectCommitConvention() doesn't throw.
  try {
    execSync("git init", { cwd: dir, stdio: "ignore" });
    execSync('git config user.email "test@crayon.dev"', { cwd: dir, stdio: "ignore" });
    execSync('git config user.name "Crayon Test"', { cwd: dir, stdio: "ignore" });
  } catch {}

  // package.json with build + test scripts.
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      scripts: { build: "tsc", test: "vitest run" },
      devDependencies: { typescript: "^5.0.0", vitest: "^3.0.0" },
    }),
    "utf-8"
  );

  // pnpm workspace file.
  await writeFile(path.join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n", "utf-8");
  await writeFile(path.join(dir, "pnpm-lock.yaml"), "", "utf-8");

  // A dummy TS file so the indexer has something to parse.
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(
    path.join(dir, "src", "index.ts"),
    "export function hello() { return 'world'; }\nexport const VERSION = '1.0.0';\n",
    "utf-8"
  );

  // tsconfig so detectIntelligence picks up TypeScript.
  await writeFile(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }), "utf-8");

  return dir;
}

function makeCtx(workspaceRoot: string, indexer: CodeIndexer) {
  return {
    workspaceRoot,
    indexer,
    permissionMode: "auto" as const,
  } as any;
}

// ---------------------------------------------------------------------------

describe("generate_project_memory tool", () => {
  let projectDir: string;
  let indexer: CodeIndexer;

  beforeEach(async () => {
    projectDir = await makeProject();
    indexer = new CodeIndexer(projectDir);
    await indexer.init();
    await indexer.index();
    await indexer.detectIntelligence();
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  // --------------------------------------------------------------------------

  it("creates AGENTS.md at the workspace root", async () => {
    const ctx = makeCtx(projectDir, indexer);
    const tool = createMemoryTool(ctx);
    const result = await tool.generate_project_memory.execute({});

    expect((result as any).success).toBe(true);
    const agentsPath = path.join(projectDir, "AGENTS.md");
    const { existsSync } = await import("node:fs");
    expect(existsSync(agentsPath)).toBe(true);
  });

  it("generated file contains required sections", async () => {
    const ctx = makeCtx(projectDir, indexer);
    const tool = createMemoryTool(ctx);
    await tool.generate_project_memory.execute({});

    const content = await readFile(path.join(projectDir, "AGENTS.md"), "utf-8");
    expect(content).toContain("## Tech Stack");
    expect(content).toContain("## Conventions");
    expect(content).toContain("## Custom Rules");
  });

  it("detected tech stack is TypeScript + pnpm", async () => {
    const ctx = makeCtx(projectDir, indexer);
    const tool = createMemoryTool(ctx);
    await tool.generate_project_memory.execute({});

    const content = await readFile(path.join(projectDir, "AGENTS.md"), "utf-8");
    expect(content).toContain("TypeScript");
    expect(content).toContain("pnpm");
  });

  it("detected common commands include build and test", async () => {
    const ctx = makeCtx(projectDir, indexer);
    const tool = createMemoryTool(ctx);
    await tool.generate_project_memory.execute({});

    const content = await readFile(path.join(projectDir, "AGENTS.md"), "utf-8");
    expect(content).toContain("## Common Commands");
    expect(content).toContain("pnpm build");
    expect(content).toContain("pnpm test");
  });

  it("key files section lists the indexed TypeScript file", async () => {
    const ctx = makeCtx(projectDir, indexer);
    const tool = createMemoryTool(ctx);
    await tool.generate_project_memory.execute({});

    const content = await readFile(path.join(projectDir, "AGENTS.md"), "utf-8");
    expect(content).toContain("## Key Files");
    expect(content).toContain("src/index.ts");
  });

  it("preserves existing Custom Rules section on refresh", async () => {
    const agentsPath = path.join(projectDir, "AGENTS.md");

    // First run — creates the file with a placeholder.
    const ctx = makeCtx(projectDir, indexer);
    const tool = createMemoryTool(ctx);
    await tool.generate_project_memory.execute({});

    // Developer adds a custom rule.
    const existing = await readFile(agentsPath, "utf-8");
    const withCustom = existing.replace(
      "## Custom Rules",
      "## Custom Rules\n- Always add JSDoc comments to public APIs"
    );
    await writeFile(agentsPath, withCustom, "utf-8");

    // Second run — should preserve the custom rule.
    await tool.generate_project_memory.execute({});

    const refreshed = await readFile(agentsPath, "utf-8");
    expect(refreshed).toContain("Always add JSDoc comments to public APIs");
  });

  it("supports custom output_path", async () => {
    const ctx = makeCtx(projectDir, indexer);
    const tool = createMemoryTool(ctx);
    await tool.generate_project_memory.execute({ output_path: "docs/MEMORY.md" });

    const { existsSync } = await import("node:fs");
    expect(existsSync(path.join(projectDir, "docs", "MEMORY.md"))).toBe(true);
  });

  it("returns a preview of the generated content", async () => {
    const ctx = makeCtx(projectDir, indexer);
    const tool = createMemoryTool(ctx);
    const result = await tool.generate_project_memory.execute({}) as any;

    expect(result.success).toBe(true);
    expect(typeof result.preview).toBe("string");
    expect(result.preview.length).toBeGreaterThan(0);
  });
});
