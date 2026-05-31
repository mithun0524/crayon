import { describe, it, expect } from "vitest";
import { microCompact, estimateTokenCount, getCompactionLevel } from "./compaction.js";
import type { CoreMessage, ToolMessage } from "ai";

describe("compaction", () => {
  describe("microCompact", () => {
    it("preserves the last 4 messages", () => {
      const messages: CoreMessage[] = [
        { role: "user", content: "m1" },
        { role: "assistant", content: "m2" },
        { role: "user", content: "m3" },
        { role: "assistant", content: "m4" },
        { role: "user", content: "m5" },
      ];
      const result = microCompact(messages);
      expect(result).toEqual(messages);
    });

    it("truncates large tool results older than the last 4 messages", () => {
      const largeText = "a".repeat(1000);
      const messages: CoreMessage[] = [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_1",
              toolName: "test",
              result: largeText,
            },
          ],
        },
        { role: "user", content: "m2" },
        { role: "assistant", content: "m3" },
        { role: "user", content: "m4" },
        { role: "assistant", content: "m5" },
        { role: "user", content: "m6" },
      ];

      const result = microCompact(messages);
      
      const firstMsg = result[0] as ToolMessage;
      expect(firstMsg.role).toBe("tool");
      expect((firstMsg.content as any)[0].result.length).toBeLessThan(1000);
      expect((firstMsg.content as any)[0].result).toContain("... (truncated)");
      
      // Check the preserved tail
      expect(result.slice(-4)).toEqual(messages.slice(-4));
    });
  });

  describe("estimateTokenCount", () => {
    it("estimates token count correctly based on characters", () => {
      const messages: CoreMessage[] = [
        { role: "user", content: "abcd" }, // 4 chars -> 1 token
        { role: "assistant", content: "efghijkl" }, // 8 chars -> 2 tokens
      ];
      // Total 12 chars -> 3 tokens
      expect(estimateTokenCount(messages)).toBe(3);
    });
  });

  describe("getCompactionLevel", () => {
    it("returns 'none' if ratio <= 0.6", () => {
      const messages: CoreMessage[] = [{ role: "user", content: "a".repeat(2400) }]; // 600 tokens
      expect(getCompactionLevel(messages, 1000)).toBe("none");
    });

    it("returns 'micro' if ratio > 0.6 and <= 0.8", () => {
      const messages: CoreMessage[] = [{ role: "user", content: "a".repeat(2800) }]; // 700 tokens
      expect(getCompactionLevel(messages, 1000)).toBe("micro");
    });

    it("returns 'auto' if ratio > 0.8", () => {
      const messages: CoreMessage[] = [{ role: "user", content: "a".repeat(3600) }]; // 900 tokens
      expect(getCompactionLevel(messages, 1000)).toBe("auto");
    });
  });
});
