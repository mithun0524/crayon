import { describe, it, expect, vi } from "vitest";
import { buildStaticSystemPrompt, buildDynamicContext } from "./manager.js";
import type { CodeIndexer } from "crayon-indexer";
import type { WorkingMemory } from "../memory/working.js";
import type { EpisodicMemory } from "../memory/episodic.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("manager", () => {
  describe("buildStaticSystemPrompt", () => {
    it("returns correct prompt with mode instructions and rules", () => {
      const prompt = buildStaticSystemPrompt("coding");
      expect(prompt).toContain("You are Crayon");
      expect(prompt).toContain("coding");
      expect(prompt).toContain("Rules and Constraints");
      expect(prompt).toContain("Output Style & Efficiency");
      expect(prompt).toContain("Verification Contract");
    });
  });

  describe("buildDynamicContext", () => {
    it("reads CLAUDE.md and .crayon.md from workspaceRoot", async () => {
      // Create a temporary workspace root
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-test-"));
      
      const claudeContent = "CLAUDE Rules:\n- Keep edits small";
      const crayonContent = "Crayon Rules:\n- No extra emojis";
      
      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), claudeContent);
      fs.writeFileSync(path.join(tmpDir, ".crayon.md"), crayonContent);

      const mockIndexer = {
        search: vi.fn().mockResolvedValue([]),
        getIntelligence: vi.fn().mockResolvedValue(null),
      } as unknown as CodeIndexer;

      const mockWorkingMemory = {
        getRecentToolOutputs: vi.fn().mockReturnValue(""),
      } as unknown as WorkingMemory;

      const mockEpisodicMemory = {
        getRecent: vi.fn().mockReturnValue([]),
        getSemanticSummary: vi.fn().mockReturnValue(""),
      } as unknown as EpisodicMemory;

      try {
        const context = await buildDynamicContext({
          task: "Test task",
          plan: ["Step 1"],
          mode: "coding",
          workspaceRoot: tmpDir,
          indexer: mockIndexer,
          workingMemory: mockWorkingMemory,
          episodicMemory: mockEpisodicMemory,
        });

        expect(context).toContain("### From CLAUDE.md:");
        expect(context).toContain(claudeContent);
        expect(context).toContain("### From .crayon.md:");
        expect(context).toContain(crayonContent);
      } finally {
        // Cleanup temp files
        fs.unlinkSync(path.join(tmpDir, "CLAUDE.md"));
        fs.unlinkSync(path.join(tmpDir, ".crayon.md"));
        fs.rmdirSync(tmpDir);
      }
    });

    it("walks the CLAUDE.md/AGENTS.md hierarchy down to the current file", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-hier-"));
      const sub = path.join(tmpDir, "packages", "web");
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "ROOT_RULES");
      fs.writeFileSync(path.join(sub, "AGENTS.md"), "WEB_RULES");

      const mockIndexer = {
        search: vi.fn().mockResolvedValue([]),
        getIntelligence: vi.fn().mockResolvedValue(null),
      } as unknown as CodeIndexer;
      const wm = { getRecentToolOutputs: vi.fn().mockReturnValue("") } as unknown as WorkingMemory;
      const em = {
        getRecent: vi.fn().mockReturnValue([]),
        getSemanticSummary: vi.fn().mockReturnValue(""),
      } as unknown as EpisodicMemory;

      try {
        const context = await buildDynamicContext({
          task: "edit the navbar",
          plan: [],
          mode: "coding",
          workspaceRoot: tmpDir,
          indexer: mockIndexer,
          workingMemory: wm,
          episodicMemory: em,
          currentFile: "packages/web/Navbar.tsx",
        });
        expect(context).toContain("ROOT_RULES");
        expect(context).toContain("WEB_RULES");
        // Deeper (more specific) rule appears AFTER the root rule.
        expect(context.indexOf("WEB_RULES")).toBeGreaterThan(context.indexOf("ROOT_RULES"));
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("budgets the relevant-files list instead of dumping everything", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crayon-budget-"));
      // 50 fat results — the budget must trim well below all of them.
      const many = Array.from({ length: 50 }, (_, i) => ({
        path: `src/file-${i}.ts`,
        line: i,
        symbol: `sym${i}`,
        snippet: "x".repeat(300),
        score: 1 - i / 100,
        matchType: "vector",
      }));
      const mockIndexer = {
        search: vi.fn().mockResolvedValue(many),
        getIntelligence: vi.fn().mockResolvedValue(null),
      } as unknown as CodeIndexer;
      const wm = { getRecentToolOutputs: vi.fn().mockReturnValue("") } as unknown as WorkingMemory;
      const em = {
        getRecent: vi.fn().mockReturnValue([]),
        getSemanticSummary: vi.fn().mockReturnValue(""),
      } as unknown as EpisodicMemory;

      try {
        const context = await buildDynamicContext({
          task: "find something",
          plan: [],
          mode: "coding",
          workspaceRoot: tmpDir,
          indexer: mockIndexer,
          workingMemory: wm,
          episodicMemory: em,
        });
        const listed = (context.match(/^- src\/file-\d+\.ts/gm) || []).length;
        expect(listed).toBeGreaterThanOrEqual(3); // always keep the top few
        expect(listed).toBeLessThan(50); // but not all 50
        expect(context).toContain("src/file-0.ts"); // highest-ranked kept
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
