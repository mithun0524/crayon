import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runEvaluation, detectTestCommand } from "./check.js";

describe("runEvaluation", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "crayon-eval-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns null when verification is disabled ('none')", async () => {
    const res = await runEvaluation(root, "none");
    expect(res).toBeNull();
  });

  it("runs exactly the configured command (passing)", async () => {
    const res = await runEvaluation(root, "echo verified-ok");
    expect(res).not.toBeNull();
    expect(res!.passed).toBe(true);
    expect(res!.command).toBe("echo verified-ok");
    expect(res!.stdout).toContain("verified-ok");
  });

  it("runs exactly the configured command (failing)", async () => {
    const res = await runEvaluation(root, "exit 3");
    expect(res).not.toBeNull();
    expect(res!.passed).toBe(false);
    expect(res!.exitCode).toBe(3);
  });

  it("explicit command skips auto-detection even when a package.json exists", async () => {
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "exit 1" } }),
      "utf-8"
    );
    const res = await runEvaluation(root, "echo custom");
    expect(res!.passed).toBe(true);
    expect(res!.command).toBe("echo custom");
  });

  it("auto-detects when no command is configured", async () => {
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "echo autodetected" } }),
      "utf-8"
    );
    const cmd = await detectTestCommand(root);
    expect(cmd).toMatch(/test$/);
  });

  it("returns null with nothing configured and nothing detectable", async () => {
    const res = await runEvaluation(root);
    expect(res).toBeNull();
  });
});
