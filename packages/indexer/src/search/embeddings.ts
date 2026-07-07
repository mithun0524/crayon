import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * Wraps OpenAI text embeddings. Semantic (vector) search is only meaningful when
 * an OpenAI API key is present — otherwise `isAvailable()` returns false and callers
 * should skip embedding entirely rather than issuing calls that will fail.
 */
export class EmbeddingProvider {
  constructor(private modelName = "text-embedding-3-small") {}

  /** True only when embeddings can actually be produced (OpenAI key present). */
  static isAvailable(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  isAvailable(): boolean {
    return EmbeddingProvider.isAvailable();
  }

  async embedText(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: openai.embedding(this.modelName) as any,
      value: text,
    });
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const { embeddings } = await embedMany({
      model: openai.embedding(this.modelName) as any,
      values: texts,
    });

    return embeddings;
  }
}
