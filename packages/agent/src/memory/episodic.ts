import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export interface EpisodicEntry {
  id?: number;
  task: string;
  actions: string;
  outcome: string;
  success: boolean;
  timestamp: string;
}

interface MemoryStore {
  episodic: EpisodicEntry[];
  semantic: Record<string, string>;
  nextId: number;
}

export class EpisodicMemory {
  private storePath: string;
  private store: MemoryStore;

  constructor(workspaceRoot: string) {
    const crayonDir = path.join(workspaceRoot, ".crayon");
    mkdirSync(crayonDir, { recursive: true });
    this.storePath = path.join(crayonDir, "memory.json");
    this.store = this.load();
  }

  private load(): MemoryStore {
    if (!existsSync(this.storePath)) {
      return { episodic: [], semantic: {}, nextId: 1 };
    }
    try {
      const raw = readFileSync(this.storePath, "utf-8");
      return JSON.parse(raw) as MemoryStore;
    } catch {
      return { episodic: [], semantic: {}, nextId: 1 };
    }
  }

  private persist(): void {
    writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
  }

  save(entry: EpisodicEntry): void {
    this.store.episodic.push({
      ...entry,
      id: this.store.nextId++,
    });
    this.persist();
  }

  getRecent(limit = 5): EpisodicEntry[] {
    return [...this.store.episodic]
      .reverse()
      .slice(0, limit);
  }

  setSemantic(key: string, value: string): void {
    this.store.semantic[key] = value;
    this.persist();
  }

  getSemantic(key: string): string | null {
    return this.store.semantic[key] ?? null;
  }

  getSemanticSummary(): string {
    const rows = Object.entries(this.store.semantic);
    if (rows.length === 0) return "";
    return rows.map(([key, value]) => `${key}: ${value}`).join("\n");
  }

  close(): void {
    this.persist();
  }
}
