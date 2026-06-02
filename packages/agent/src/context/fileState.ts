import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

interface FileEntry {
  content: string;
  readAt: number;
}

/**
 * Tracks which files the agent has read during this session.
 * Used to warn when the agent tries to edit a file it hasn't read.
 */
export class FileStateCache {
  private cache = new Map<string, FileEntry>();

  /**
   * Record that the agent read this file.
   */
  markRead(filePath: string, content: string): void {
    this.cache.set(filePath, {
      content,
      readAt: Date.now(),
    });
  }

  /**
   * Check if the file was previously read by the agent.
   */
  hasRead(filePath: string): boolean {
    return this.cache.has(filePath);
  }

  /**
   * Get the content at the time the file was last read, or null if not read.
   */
  getReadContent(filePath: string): string | null {
    return this.cache.get(filePath)?.content ?? null;
  }

  /**
   * Compare current disk content with the cached version.
   * Returns true if the file was modified externally since last read.
   */
  async wasModifiedExternally(filePath: string): Promise<boolean> {
    const entry = this.cache.get(filePath);
    if (!entry) return false;

    if (!existsSync(filePath)) return true;

    try {
      const currentContent = await readFile(filePath, "utf-8");
      return currentContent !== entry.content;
    } catch {
      return true;
    }
  }

  /**
   * Clear all cached file state.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get all currently tracked file paths.
   */
  getTrackedFiles(): string[] {
    return Array.from(this.cache.keys());
  }
}
