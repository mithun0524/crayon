import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { autoCommitEdits } from "./autoCommit.js";

function sh(cmd: string, cwd: string) {
  return execSync(cmd, { cwd, encoding: "utf8" });
}

describe("autoCommitEdits", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "crayon-ac-"));
    sh("git init -q", root);
    sh("git config user.email t@t.t && git config user.name t", root);
    await writeFile(path.join(root, "base.txt"), "base", "utf-8");
    sh("git add . && git commit -qm base", root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("commits exactly the task's edited files with a derived message", async () => {
    await writeFile(path.join(root, "a.txt"), "task change", "utf-8");
    await writeFile(path.join(root, "unrelated.txt"), "should NOT be committed", "utf-8");

    const res = await autoCommitEdits(root, "fix the login validation bug in auth module", ["a.txt"]);
    expect(res.committed).toBe(true);
    expect(res.message).toBe("crayon: fix the login validation bug in auth module");

    const lastFiles = sh("git show --name-only --format=", root).trim().split("\n");
    expect(lastFiles).toEqual(["a.txt"]);
    // Unrelated file left uncommitted
    expect(sh("git status --porcelain", root)).toContain("unrelated.txt");
  });

  it("truncates long task subjects", async () => {
    await writeFile(path.join(root, "b.txt"), "x", "utf-8");
    const long = "y".repeat(100);
    const res = await autoCommitEdits(root, long, ["b.txt"]);
    expect(res.committed).toBe(true);
    expect(res.message!.length).toBeLessThanOrEqual("crayon: ".length + 60);
    expect(res.message).toMatch(/\.\.\.$/);
  });

  it("no-ops with no edits", async () => {
    const res = await autoCommitEdits(root, "task", []);
    expect(res.committed).toBe(false);
    expect(res.reason).toBe("no edits");
  });

  it("no-ops outside a git repo", async () => {
    const bare = await mkdtemp(path.join(os.tmpdir(), "crayon-ac-nogit-"));
    await writeFile(path.join(bare, "c.txt"), "x", "utf-8");
    const res = await autoCommitEdits(bare, "task", ["c.txt"]);
    expect(res.committed).toBe(false);
    await rm(bare, { recursive: true, force: true });
  });

  it("survives a nonexistent edit path without throwing", async () => {
    const res = await autoCommitEdits(root, "task", ["does-not-exist.txt"]);
    expect(res.committed).toBe(false);
  });
});
