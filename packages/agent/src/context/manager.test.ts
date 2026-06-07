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
  });
});
