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

  it("ranks recall by lexical relevance, not recency (no embedder)", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "crayon-test-"));
    const memory = new EpisodicMemory(dir); // no OPENAI key in tests → lexical
    const base = new Date().toISOString();
    memory.save({ task: "add authentication middleware", actions: "[]", outcome: "done", success: true, timestamp: base });
    memory.save({ task: "fix the CSS navbar spacing", actions: "[]", outcome: "done", success: true, timestamp: base });
    memory.save({ task: "write docs for the readme", actions: "[]", outcome: "done", success: true, timestamp: base });

    // Query relevant to the FIRST (oldest) episode — recency would rank it last.
    const relevant = await memory.getRelevant("update authentication login flow", 1);
    expect(relevant).toHaveLength(1);
    expect(relevant[0].task).toBe("add authentication middleware");
    memory.close();
  });

  it("ranks recall by semantic similarity when an embedder is provided", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "crayon-test-"));
    // Toy embedder: map text to a 2-D vector by keyword presence.
    const embed = async (t: string) => [
      /auth|login|session/i.test(t) ? 1 : 0,
      /css|style|navbar|ui/i.test(t) ? 1 : 0,
    ];
    const memory = new EpisodicMemory(dir, { embed });
    const base = new Date().toISOString();
    memory.save({ task: "auth session handling", actions: "[]", outcome: "ok", success: true, timestamp: base });
    memory.save({ task: "navbar css tweaks", actions: "[]", outcome: "ok", success: true, timestamp: base });

    const relevant = await memory.getRelevant("fix the login session bug", 1);
    expect(relevant).toHaveLength(1);
    expect(relevant[0].task).toBe("auth session handling");
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
