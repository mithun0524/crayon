export interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "method" | "export";
  line: number;
  endLine?: number;
}

export interface FileSymbols {
  path: string;
  language: string;
  imports: string[];
  exports: string[];
  symbols: SymbolInfo[];
  hash: string;
  mtime: number;
}

export interface SearchResult {
  path: string;
  score: number;
  matchType: "grep" | "symbol" | "graph";
  line?: number;
  snippet?: string;
  symbol?: string;
}

export interface RepoIntelligence {
  framework?: string;
  language?: string;
  packageManager?: string;
  testRunner?: string;
  dependencies?: string[];
}

export interface IndexStats {
  fileCount: number;
  symbolCount: number;
  lastIndexed: string;
}
