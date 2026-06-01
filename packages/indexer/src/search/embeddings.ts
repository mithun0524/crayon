import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

export class EmbeddingProvider {
  constructor(private modelName = "text-embedding-3-small") {}

  async embedText(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: openai.embedding(this.modelName) as any,
      value: text,
    });
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    
    // Batch in chunks if necessary, but embedMany handles standard batching
    const { embeddings } = await embedMany({
      model: openai.embedding(this.modelName) as any,
      values: texts,
    });
    
    return embeddings;
  }
}
