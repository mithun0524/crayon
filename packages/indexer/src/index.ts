import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import type { FileSymbols, IndexStats, RepoIntelligence, SearchResult, SymbolInfo } from "./types.js";
import type { VectorRecord } from "./search/vector-store.js";
import { parseFile } from "./parser/symbols.js";
import { DependencyGraph } from "./graph/dependency.js";
import { hybridSearch } from "./search/hybrid.js";
import { detectRepoIntelligence } from "./repo-intelligence.js";
import { VectorStore } from "./search/vector-store.js";

const CODE_GLOBS = [
  "**/*.{ts,tsx,js,jsx,mjs,cjs,py,go}",
  "!**/node_modules/**",
  "!**/dist/**",
  "!**/.git/**",
  "!**/.crayon/**",
];

export class CodeIndexer {
  private files = new Map<string, FileSymbols>();
  private graph = new DependencyGraph();
  private vectorStore: VectorStore;
  private watcher: FSWatcher | null = null;
  readonly crayonDir: string;
  readonly symbolsPath: string;
  readonly intelligencePath: string;

  constructor(readonly workspaceRoot: string) {
    this.crayonDir = path.join(workspaceRoot, ".crayon");
    this.symbolsPath = path.join(this.crayonDir, "symbols.json");
    this.intelligencePath = path.join(this.crayonDir, "intelligence.json");
    this.vectorStore = new VectorStore(this.crayonDir);
  }

  async init(): Promise<void> {
    await mkdir(this.crayonDir, { recursive: true });
    if (existsSync(this.symbolsPath)) {
      await this.loadCache();
    }
    await this.vectorStore.init();
  }

  async index(force = false): Promise<IndexStats> {
    await this.init();
    const filePaths = await fg(CODE_GLOBS, { cwd: this.workspaceRoot, absolute: true });
    let indexed = 0;

    for (const filePath of filePaths) {
      const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, "/");
      const fileStat = await stat(filePath);
      const cached = this.files.get(relativePath);

      if (!force && cached && cached.mtime === fileStat.mtimeMs) {
        continue;
      }

      try {
        const symbols = await parseFile(filePath, this.workspaceRoot);
        this.files.set(relativePath, symbols);

        // Add to vector store (only when semantic search is actually available).
        if (this.vectorStore.isEnabled()) {
          try {
            const records = await this.buildVectorRecords(relativePath, symbols.symbols);
            if (records.length > 0) await this.vectorStore.addDocuments(records);
          } catch {
            // ignore embedding errors
          }
        }

        indexed++;
      } catch {
        // skip unreadable files
      }
    }

    this.graph.build(this.files, this.workspaceRoot);
    await this.saveCache();

    return {
      fileCount: this.files.size,
      symbolCount: [...this.files.values()].reduce((n, f) => n + f.symbols.length, 0),
      lastIndexed: new Date().toISOString(),
    };
  }

  /**
   * Build embedding records that include the symbol's actual source body (not just its
   * name), so semantic search matches on implementation, not just identifiers. Reads the
   * file once and slices each symbol's line range (capped to keep embeddings cheap).
   */
  private async buildVectorRecords(
    relativePath: string,
    symbols: SymbolInfo[]
  ): Promise<Omit<VectorRecord, "vector">[]> {
    if (symbols.length === 0) return [];
    let lines: string[];
    try {
      const abs = path.join(this.workspaceRoot, relativePath);
      lines = (await readFile(abs, "utf-8")).split("\n");
    } catch {
      return [];
    }
    return symbols.map((sym) => {
      const start = Math.max(0, sym.line - 1);
      const end = Math.min(lines.length, sym.endLine ?? sym.line);
      const body = lines.slice(start, end).join("\n").slice(0, 800);
      return {
        text: `File: ${relativePath}\nSymbol: ${sym.name} (${sym.kind})\n\n${body}`,
        filePath: relativePath,
        symbolName: sym.name,
        kind: sym.kind,
      };
    });
  }

  async detectIntelligence(): Promise<RepoIntelligence> {
    const intel = await detectRepoIntelligence(this.workspaceRoot);
    await mkdir(this.crayonDir, { recursive: true });
    await writeFile(this.intelligencePath, JSON.stringify(intel, null, 2));
    return intel;
  }

  async getIntelligence(): Promise<RepoIntelligence | null> {
    if (!existsSync(this.intelligencePath)) return null;
    try {
      const raw = await readFile(this.intelligencePath, "utf-8");
      return JSON.parse(raw) as RepoIntelligence;
    } catch {
      return null;
    }
  }

  async search(query: string, maxResults = 20): Promise<SearchResult[]> {
    // Basic hybrid search (exact match + vector)
    const exactMatches = await hybridSearch(query, this.workspaceRoot, this.files, this.graph, maxResults);
    
    // We can also augment with vector search if desired
    try {
      const vectorResults = await this.vectorStore.search(query, maxResults);
      // Map vectorResults to SearchResult structure
      for (const res of vectorResults) {
        if (!exactMatches.find(e => e.path === res.filePath && e.symbol === res.symbolName)) {
          exactMatches.push({
            path: res.filePath,
            score: 1 - (res._distance || 0), // LanceDB returns L2 distance by default
            matchType: "symbol",
            symbol: res.symbolName
          });
        }
      }
    } catch {
      // If vector search fails, just fallback to exact match
    }
    
    exactMatches.sort((a, b) => b.score - a.score);
    return exactMatches.slice(0, maxResults);
  }

  getFileSymbols(filePath: string): FileSymbols | undefined {
    return this.files.get(filePath);
  }

  getAllFiles(): Map<string, FileSymbols> {
    return this.files;
  }

  getGraph(): DependencyGraph {
    return this.graph;
  }

  getImpactedFiles(filePath: string, hops = 2): string[] {
    return this.graph.getImpactedFiles(filePath, hops);
  }

  watch(onChange?: (filePath: string) => void): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(CODE_GLOBS, {
      cwd: this.workspaceRoot,
      ignored: /node_modules|\.git|\.crayon|dist/,
      ignoreInitial: true,
    });

    this.watcher.on("change", async (relativePath: string) => {
      const absPath = path.join(this.workspaceRoot, relativePath);
      try {
        const symbols = await parseFile(absPath, this.workspaceRoot);
        const relKey = relativePath.replace(/\\/g, "/");
        this.files.set(relKey, symbols);

        if (this.vectorStore.isEnabled()) {
          try {
            const records = await this.buildVectorRecords(relKey, symbols.symbols);
            if (records.length > 0) await this.vectorStore.addDocuments(records);
          } catch {}
        }

        this.graph.build(this.files, this.workspaceRoot);
        await this.saveCache();
        onChange?.(relativePath);
      } catch {
        // skip
      }
    });

    this.watcher.on("add", async (relativePath: string) => {
      const absPath = path.join(this.workspaceRoot, relativePath);
      try {
        const symbols = await parseFile(absPath, this.workspaceRoot);
        const relKey = relativePath.replace(/\\/g, "/");
        this.files.set(relKey, symbols);

        if (this.vectorStore.isEnabled()) {
          try {
            const records = await this.buildVectorRecords(relKey, symbols.symbols);
            if (records.length > 0) await this.vectorStore.addDocuments(records);
          } catch {}
        }

        this.graph.build(this.files, this.workspaceRoot);
        await this.saveCache();
        onChange?.(relativePath);
      } catch {
        // skip
      }
    });

    this.watcher.on("unlink", async (relativePath: string) => {
      this.files.delete(relativePath.replace(/\\/g, "/"));
      this.graph.build(this.files, this.workspaceRoot);
      await this.saveCache();
      onChange?.(relativePath);
    });
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private async loadCache(): Promise<void> {
    try {
      const raw = await readFile(this.symbolsPath, "utf-8");
      const data = JSON.parse(raw) as { files: FileSymbols[] };
      this.files.clear();
      for (const file of data.files) {
        this.files.set(file.path, file);
      }
      this.graph.build(this.files, this.workspaceRoot);
    } catch {
      this.files.clear();
    }
  }

  private async saveCache(): Promise<void> {
    await mkdir(this.crayonDir, { recursive: true });
    await writeFile(
      this.symbolsPath,
      JSON.stringify({ files: [...this.files.values()] }, null, 2)
    );
  }
}

export * from "./types.js";
export { DependencyGraph } from "./graph/dependency.js";
export { detectRepoIntelligence } from "./repo-intelligence.js";
export type { GrepMatch } from "./search/ripgrep.js";
