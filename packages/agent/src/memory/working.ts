import type { CoreMessage } from "ai";

export class WorkingMemory {
  private messages: CoreMessage[] = [];
  private toolOutputs: Array<{ tool: string; output: unknown; timestamp: number }> = [];
  private editedFiles = new Set<string>();

  addMessage(message: CoreMessage): void {
    this.messages.push(message);
  }

  addToolOutput(tool: string, output: unknown): void {
    this.toolOutputs.push({ tool, output, timestamp: Date.now() });
  }

  markEdited(filePath: string): void {
    this.editedFiles.add(filePath);
  }

  getMessages(): CoreMessage[] {
    return [...this.messages];
  }

  getEditedFiles(): string[] {
    return [...this.editedFiles];
  }

  hasEdits(): boolean {
    return this.editedFiles.size > 0;
  }

  getRecentToolOutputs(limit = 10): string {
    return this.toolOutputs
      .slice(-limit)
      .map((t) => `[${t.tool}]: ${JSON.stringify(t.output).slice(0, 500)}`)
      .join("\n");
  }

  clear(): void {
    this.messages = [];
    this.toolOutputs = [];
    this.editedFiles.clear();
  }
}
