import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import { WorktreeManager } from "./WorktreeManager.js";

/** Normalize path separators for cross-platform comparison. */
const normPath = (p: string) => p.replace(/\\/g, "/");

/**
 * Helpers to spin up a minimal real git repo in a temp directory so that
 * WorktreeManager can run real `git worktree` commands without touching the
 * project's own repository.
 */
async function makeGitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "crayon-wt-test-"));
  execSync("git init -b main", { cwd: dir, stdio: "ignore" });
  execSync('git config user.email "test@crayon.dev"', { cwd: dir, stdio: "ignore" });
  execSync('git config user.name "Crayon Test"', { cwd: dir, stdio: "ignore" });
  // Need at least one commit for worktree commands to work.
  await writeFile(path.join(dir, "README.md"), "# test\n");
  execSync("git add .", { cwd: dir, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: dir, stdio: "ignore" });
  return dir;
}

async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Run a single git command in cwd. */
function git(args: string, cwd: string): void {
  execSync(`git ${args}`, { cwd, stdio: "ignore" });
}

describe("WorktreeManager", () => {
  let repoDir: string;
  let manager: WorktreeManager;

  beforeEach(async () => {
    repoDir = await makeGitRepo();
    manager = new WorktreeManager(repoDir);
  });

  afterEach(async () => {
    // Try to remove any leftover worktrees before cleaning the repo dir.
    try {
      const list = await manager.list();
      for (const wt of list) {
        await manager.remove(wt.path).catch(() => {});
      }
    } catch {}
    await cleanupDir(repoDir);
  });

  // --------------------------------------------------------------------------

  it("create() returns a valid worktreePath and branch", async () => {
    const result = await manager.create("feature-x");

    expect(result.worktreePath).toBeTruthy();
    expect(result.branch).toMatch(/^crayon\/sandbox\/feature-x-\d{13}$/);
    // The directory should exist on disk.
    const { existsSync } = await import("node:fs");
    expect(existsSync(result.worktreePath)).toBe(true);
  });

  it("list() includes the newly created sandbox", async () => {
    const { worktreePath, branch } = await manager.create("list-test");
    const sandboxes = await manager.list();

    // Normalise path separators: git porcelain can use forward-slashes on Windows.
    const found = sandboxes.find((wt) => normPath(wt.path) === normPath(worktreePath));
    expect(found).toBeDefined();
    expect(found!.branch).toBe(branch);
    expect(found!.label).toBe("list-test");
  });

  it("list() only returns crayon-managed sandboxes (not the primary worktree)", async () => {
    await manager.create("abc");
    const sandboxes = await manager.list();
    for (const wt of sandboxes) {
      expect(wt.branch).toMatch(/^crayon\/sandbox\//);
    }
  });

  it("diff() returns a diff after modifying a file inside the worktree", async () => {
    const { worktreePath } = await manager.create("diff-test");

    // Set user config in the worktree (explicit for CI / Windows safety).
    git('config user.email "test@crayon.dev"', worktreePath);
    git('config user.name "Crayon Test"', worktreePath);

    // Write a change inside the worktree branch.
    // Use separate git add + commit to avoid && shell issues on Windows.
    await writeFile(path.join(worktreePath, "CHANGE.md"), "hello world\n");
    git("add .", worktreePath);
    git('commit -m "add change"', worktreePath);

    const diff = await manager.diff(worktreePath);
    expect(diff).toContain("CHANGE.md");
    expect(diff).toContain("hello world");
  });

  it("diff() returns 'no changes' for an empty worktree", async () => {
    const { worktreePath } = await manager.create("empty-diff");
    const diff = await manager.diff(worktreePath);
    expect(diff).toContain("no changes");
  });

  it("remove() deletes the directory and branch", async () => {
    const { worktreePath, branch } = await manager.create("remove-test");

    await manager.remove(worktreePath);

    const { existsSync } = await import("node:fs");
    expect(existsSync(worktreePath)).toBe(false);

    // Branch should be gone.
    const sandboxes = await manager.list();
    const found = sandboxes.find((wt) => wt.branch === branch);
    expect(found).toBeUndefined();
  });

  it("remove() on a non-existent path is a no-op", async () => {
    await expect(
      manager.remove(path.join(repoDir, ".crayon", "worktrees", "does-not-exist"))
    ).resolves.not.toThrow();
  });

  it("sanitise label strips special characters", async () => {
    // Labels with special chars should still produce a valid branch.
    const result = await manager.create("Hello World! @#$");
    expect(result.branch).toMatch(/^crayon\/sandbox\/hello-world-\d{13}$/);
    await manager.remove(result.worktreePath);
  });

  it("merge() integrates worktree changes and cleans up", async () => {
    const { worktreePath } = await manager.create("merge-test");

    // Set user config in worktree for CI safety.
    git('config user.email "test@crayon.dev"', worktreePath);
    git('config user.name "Crayon Test"', worktreePath);

    // Commit a change in the worktree.
    await writeFile(path.join(worktreePath, "MERGED.md"), "merged!\n");
    git("add .", worktreePath);
    git('commit -m "add merged file"', worktreePath);

    const result = await manager.merge(worktreePath);
    expect(result.merged).toBe(true);
    expect(result.conflicts).toHaveLength(0);

    // The merged file should now be present in the primary workspace.
    const { existsSync } = await import("node:fs");
    expect(existsSync(path.join(repoDir, "MERGED.md"))).toBe(true);

    // The worktree directory should be gone.
    expect(existsSync(worktreePath)).toBe(false);
  });
});
