import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import type { FileSymbols, IndexStats, RepoIntelligence, SearchResult } from "./types.js";
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
        
        // Add to vector store
        const records = symbols.symbols.map(sym => ({
          text: `Symbol: ${sym.name}\nKind: ${sym.kind}\nFile: ${relativePath}`,
          filePath: relativePath,
          symbolName: sym.name,
          kind: sym.kind,
        }));
        
        // Don't await in loop to avoid blocking entirely, or we can await to ensure it finishes
        // Since we are doing a lot, let's collect and batch? For now, await is safe but slow for large repos.
        // We can do it inside a try/catch in case embeddings fail
        try {
          if (records.length > 0) {
             await this.vectorStore.addDocuments(records);
          }
        } catch (e) {
          // ignore embedding errors
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
        this.files.set(relativePath.replace(/\\/g, "/"), symbols);
        
        // Update vector store
        const records = symbols.symbols.map(sym => ({
          text: `Symbol: ${sym.name}\nKind: ${sym.kind}\nFile: ${relativePath.replace(/\\/g, "/")}`,
          filePath: relativePath.replace(/\\/g, "/"),
          symbolName: sym.name,
          kind: sym.kind,
        }));
        try { if (records.length > 0) await this.vectorStore.addDocuments(records); } catch {}

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
        this.files.set(relativePath.replace(/\\/g, "/"), symbols);

        // Update vector store
        const records = symbols.symbols.map(sym => ({
          text: `Symbol: ${sym.name}\nKind: ${sym.kind}\nFile: ${relativePath.replace(/\\/g, "/")}`,
          filePath: relativePath.replace(/\\/g, "/"),
          symbolName: sym.name,
          kind: sym.kind,
        }));
        try { if (records.length > 0) await this.vectorStore.addDocuments(records); } catch {}

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
