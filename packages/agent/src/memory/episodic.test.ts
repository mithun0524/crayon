import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EpisodicMemory } from "./episodic.js";

describe("EpisodicMemory", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("saves and retrieves episodic entries", () => {
    dir = mkdtempSync(path.join(tmpdir(), "crayon-test-"));
    const memory = new EpisodicMemory(dir);

    memory.save({
      task: "fix test",
      actions: '["src/test.ts"]',
      outcome: "Fixed failing test",
      success: true,
      timestamp: new Date().toISOString(),
    });

    const recent = memory.getRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.task).toBe("fix test");
    expect(recent[0]?.success).toBe(true);

    memory.close();
  });

  it("stores semantic memory", () => {
    dir = mkdtempSync(path.join(tmpdir(), "crayon-test-"));
    const memory = new EpisodicMemory(dir);

    memory.setSemantic("framework", "Next.js");
    expect(memory.getSemantic("framework")).toBe("Next.js");
    expect(memory.getSemanticSummary()).toContain("Next.js");

    memory.close();
  });
});
