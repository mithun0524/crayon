import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export interface EpisodicEntry {
  id?: number;
  task: string;
  actions: string;
  outcome: string;
  success: boolean;
  timestamp: string;
  /** Cached embedding of `task`, present once semantically indexed. */
  vector?: number[];
}

interface MemoryStore {
  episodic: EpisodicEntry[];
  semantic: Record<string, string>;
  nextId: number;
}

export type EmbedFn = (text: string) => Promise<number[]>;

/** Keep the store bounded — vectors are large, and stale episodes add noise. */
const MAX_EPISODES = 100;
/** Cap how many un-embedded episodes we back-fill in one recall (cost guard). */
const EMBED_BACKFILL_LIMIT = 40;

/**
 * Cross-run memory of past tasks. Retrieval is by RELEVANCE to the current
 * task — semantic (cosine over embeddings) when an embedder is available,
 * otherwise a lexical token-overlap fallback — not pure recency.
 */
export class EpisodicMemory {
  private storePath: string;
  private store: MemoryStore;
  private embed?: EmbedFn;
  // Memoize the relevant set within a run (getRelevant is called each step
  // with the same task) so we don't re-embed the query every turn.
  private relevantCache: { task: string; limit: number; result: EpisodicEntry[] } | null = null;

  constructor(workspaceRoot: string, opts: { embed?: EmbedFn } = {}) {
    const crayonDir = path.join(workspaceRoot, ".crayon");
    mkdirSync(crayonDir, { recursive: true });
    this.storePath = path.join(crayonDir, "memory.json");
    this.store = this.load();
    this.embed = opts.embed ?? defaultEmbedder();
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
    this.store.episodic.push({ ...entry, id: this.store.nextId++ });
    // Bound the store — drop the oldest beyond the cap.
    if (this.store.episodic.length > MAX_EPISODES) {
      this.store.episodic = this.store.episodic.slice(-MAX_EPISODES);
    }
    this.relevantCache = null; // invalidate — the corpus changed
    this.persist();
  }

  getRecent(limit = 5): EpisodicEntry[] {
    return [...this.store.episodic].reverse().slice(0, limit);
  }

  /**
   * Return the past episodes most RELEVANT to `task`. Uses embeddings when
   * available (back-filling vectors for recent un-indexed episodes once),
   * else falls back to lexical token overlap. Memoized per (task, limit)
   * across the calls a single run makes.
   */
  async getRelevant(task: string, limit = 3): Promise<EpisodicEntry[]> {
    if (this.store.episodic.length === 0) return [];
    if (this.relevantCache && this.relevantCache.task === task && this.relevantCache.limit === limit) {
      return this.relevantCache.result;
    }

    let ranked: EpisodicEntry[];
    let queryVec: number[] | null = null;
    if (this.embed) {
      try {
        queryVec = await this.embed(task);
        await this.backfillVectors();
      } catch {
        queryVec = null; // embedding unavailable at runtime → lexical fallback
      }
    }

    if (queryVec) {
      const qv = queryVec;
      ranked = [...this.store.episodic]
        .filter((e) => e.vector && e.vector.length === qv.length)
        .map((e) => ({ e, score: cosine(qv, e.vector!) }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.e);
      // Any not-yet-embeddable entries fall back to recency at the tail.
      if (ranked.length < limit) {
        const have = new Set(ranked);
        for (const e of [...this.store.episodic].reverse()) {
          if (!have.has(e)) ranked.push(e);
        }
      }
    } else {
      const qTokens = tokenize(task);
      ranked = [...this.store.episodic]
        .map((e, idx) => ({ e, idx, score: lexicalScore(qTokens, tokenize(e.task + " " + e.outcome)) }))
        // recency as the tiebreak (higher idx = more recent)
        .sort((a, b) => b.score - a.score || b.idx - a.idx)
        .map((x) => x.e);
    }

    const result = ranked.slice(0, limit);
    this.relevantCache = { task, limit, result };
    return result;
  }

  /** Embed the most recent episodes that lack a vector, then persist. */
  private async backfillVectors(): Promise<void> {
    if (!this.embed) return;
    const missing = this.store.episodic.filter((e) => !e.vector).slice(-EMBED_BACKFILL_LIMIT);
    if (missing.length === 0) return;
    let changed = false;
    for (const e of missing) {
      try {
        e.vector = await this.embed(e.task);
        changed = true;
      } catch {
        break; // embedder went unavailable — stop back-filling
      }
    }
    if (changed) this.persist();
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

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
  );
}

/** Overlap coefficient — robust to differing lengths, ignores tiny tokens. */
function lexicalScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap++;
  return overlap / Math.min(a.size, b.size);
}

/**
 * Default embedder: OpenAI text embeddings when a key is present, else none
 * (callers fall back to lexical recall). Lazily imports the SDK so agents that
 * never embed don't pay the load cost.
 */
function defaultEmbedder(): EmbedFn | undefined {
  if (!process.env.OPENAI_API_KEY) return undefined;
  return async (text: string): Promise<number[]> => {
    const { embed } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");
    const { embedding } = await embed({
      model: openai.embedding("text-embedding-3-small") as any,
      value: text,
    });
    return embedding;
  };
}
