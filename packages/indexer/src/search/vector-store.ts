import * as lancedb from "@lancedb/lancedb";
import { EmbeddingProvider } from "./embeddings.js";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export interface VectorRecord {
  vector: number[];
  text: string;
  filePath: string;
  symbolName?: string;
  kind?: string;
}

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private provider = new EmbeddingProvider();
  
  constructor(private storagePath: string) {}

  async init(): Promise<void> {
    const dbPath = path.join(this.storagePath, "lancedb");
    await mkdir(dbPath, { recursive: true });
    this.db = await lancedb.connect(dbPath);

    const tableNames = await this.db.tableNames();
    if (tableNames.includes("symbols")) {
      this.table = await this.db.openTable("symbols");
    }
  }

  async addDocuments(records: Omit<VectorRecord, "vector">[]): Promise<void> {
    if (!this.db) await this.init();
    if (records.length === 0) return;

    // We can only process batch of texts
    const vectors = await this.provider.embedBatch(records.map(r => r.text));
    
    const data = records.map((record, i) => ({
      ...record,
      vector: vectors[i],
    }));

    if (this.table) {
      await this.table.add(data);
    } else {
      this.table = await this.db!.createTable("symbols", data);
    }
  }

  async search(query: string, limit = 10): Promise<any[]> {
    if (!this.table) return [];

    const queryVector = await this.provider.embedText(query);
    const results = await this.table
      .search(queryVector)
      .limit(limit)
      .toArray();
      
    return results;
  }
}
