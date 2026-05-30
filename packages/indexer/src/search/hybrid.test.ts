import { describe, it, expect } from "vitest";
import { hybridSearch } from "./hybrid.js";
import { DependencyGraph } from "../graph/dependency.js";
import type { FileSymbols } from "../types.js";

describe("hybridSearch", () => {
  it("finds symbols by name", async () => {
    const files = new Map<string, FileSymbols>([
      [
        "src/utils.ts",
        {
          path: "src/utils.ts",
          language: "typescript",
          imports: [],
          exports: ["formatDate"],
          symbols: [{ name: "formatDate", kind: "function", line: 1 }],
          hash: "abc",
          mtime: 0,
        },
      ],
    ]);

    const graph = new DependencyGraph();
    graph.build(files, "/tmp");

    const results = await hybridSearch("formatDate", "/tmp", files, graph, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.path).toBe("src/utils.ts");
    expect(results[0]?.symbol).toBe("formatDate");
  });
});

describe("DependencyGraph", () => {
  it("expands dependencies", () => {
    const files = new Map<string, FileSymbols>([
      ["a.ts", { path: "a.ts", language: "typescript", imports: ["./b.ts"], exports: [], symbols: [], hash: "a", mtime: 0 }],
      ["b.ts", { path: "b.ts", language: "typescript", imports: ["./c.ts"], exports: [], symbols: [], hash: "b", mtime: 0 }],
      ["c.ts", { path: "c.ts", language: "typescript", imports: [], exports: [], symbols: [], hash: "c", mtime: 0 }],
    ]);

    const graph = new DependencyGraph();
    graph.build(files, "/tmp");

    const expanded = graph.expand(["a.ts"], 2);
    expect(expanded).toContain("a.ts");
    expect(expanded).toContain("b.ts");
    expect(expanded).toContain("c.ts");
  });
});
