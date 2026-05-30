import type { FileSymbols, SearchResult } from "../types.js";
import type { DependencyGraph } from "../graph/dependency.js";
import { ripgrepSearch } from "./ripgrep.js";

function fuzzyMatch(query: string, symbol: string): number {
  const q = query.toLowerCase();
  const s = symbol.toLowerCase();

  if (s === q) return 100;
  if (s.includes(q)) return 80;
  if (s.startsWith(q)) return 90;

  let score = 0;
  let qi = 0;
  for (let si = 0; si < s.length && qi < q.length; si++) {
    if (s[si] === q[qi]) {
      score += 10;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export async function hybridSearch(
  query: string,
  workspaceRoot: string,
  files: Map<string, FileSymbols>,
  graph: DependencyGraph,
  maxResults = 20
): Promise<SearchResult[]> {
  const results = new Map<string, SearchResult>();

  // Symbol search
  for (const [filePath, fileSymbols] of files) {
    for (const sym of fileSymbols.symbols) {
      const score = fuzzyMatch(query, sym.name);
      if (score > 0) {
        const existing = results.get(filePath);
        if (!existing || score > existing.score) {
          results.set(filePath, {
            path: filePath,
            score: score + 20,
            matchType: "symbol",
            line: sym.line,
            symbol: sym.name,
          });
        }
      }
    }
  }

  // Ripgrep search
  const grepMatches = await ripgrepSearch(query, workspaceRoot);
  for (const match of grepMatches) {
    const existing = results.get(match.path);
    const score = 50;
    if (!existing || score > existing.score) {
      results.set(match.path, {
        path: match.path,
        score,
        matchType: "grep",
        line: match.line,
        snippet: match.text,
      });
    }
  }

  // Graph expansion for top seed files
  const seeds = [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => r.path);

  const expanded = graph.expand(seeds, 1);
  for (const filePath of expanded) {
    if (!results.has(filePath) && files.has(filePath)) {
      results.set(filePath, {
        path: filePath,
        score: 30,
        matchType: "graph",
      });
    }
  }

  return [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
