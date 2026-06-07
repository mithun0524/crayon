import type { FileSymbols } from "../types.js";
import { resolveImport } from "../parser/symbols.js";

export class DependencyGraph {
  private adjacency = new Map<string, Set<string>>();
  private reverseAdjacency = new Map<string, Set<string>>();

  build(files: Map<string, FileSymbols>, workspaceRoot: string): void {
    this.adjacency.clear();
    this.reverseAdjacency.clear();

    for (const [filePath, fileSymbols] of files) {
      const deps = new Set<string>();

      for (const imp of fileSymbols.imports) {
        const resolved = resolveImport(imp, filePath, workspaceRoot);
        if (resolved && files.has(resolved)) {
          deps.add(resolved);
          if (!this.reverseAdjacency.has(resolved)) {
            this.reverseAdjacency.set(resolved, new Set());
          }
          this.reverseAdjacency.get(resolved)!.add(filePath);
        }
      }

      this.adjacency.set(filePath, deps);
    }
  }

  getDependencies(filePath: string): string[] {
    return [...(this.adjacency.get(filePath) ?? [])];
  }

  getDependents(filePath: string): string[] {
    return [...(this.reverseAdjacency.get(filePath) ?? [])];
  }

  expand(filePaths: string[], hops = 2): string[] {
    const visited = new Set<string>(filePaths);
    let frontier = [...filePaths];

    for (let h = 0; h < hops; h++) {
      const next: string[] = [];
      for (const file of frontier) {
        for (const dep of this.getDependencies(file)) {
          if (!visited.has(dep)) {
            visited.add(dep);
            next.push(dep);
          }
        }
      }
      frontier = next;
    }

    return [...visited];
  }

  getRelated(filePath: string, hops = 1): string[] {
    return this.expand([filePath], hops).filter((f) => f !== filePath);
  }

  getImpactedFiles(filePath: string, hops = 2): string[] {
    const visited = new Set<string>([filePath]);
    let frontier = [filePath];

    for (let h = 0; h < hops; h++) {
      const next: string[] = [];
      for (const file of frontier) {
        for (const dependent of this.getDependents(file)) {
          if (!visited.has(dependent)) {
            visited.add(dependent);
            next.push(dependent);
          }
        }
      }
      frontier = next;
    }

    return [...visited].filter(f => f !== filePath);
  }
}
