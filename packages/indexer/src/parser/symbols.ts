import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { FileSymbols, SymbolInfo } from "../types.js";

const TS_EXT = new Set([".ts", ".tsx"]);
const JS_EXT = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const PY_EXT = new Set([".py"]);
const GO_EXT = new Set([".go"]);
const RUST_EXT = new Set([".rs"]);
const JAVA_EXT = new Set([".java"]);

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (TS_EXT.has(ext)) return "typescript";
  if (JS_EXT.has(ext)) return "javascript";
  if (PY_EXT.has(ext)) return "python";
  if (GO_EXT.has(ext)) return "go";
  if (RUST_EXT.has(ext)) return "rust";
  if (JAVA_EXT.has(ext)) return "java";
  return "unknown";
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function extractTsJsSymbols(content: string): {
  imports: string[];
  exports: string[];
  symbols: SymbolInfo[];
} {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: SymbolInfo[] = [];
  const lines = content.split("\n");

  const importRe = /^\s*import\s+(?:type\s+)?(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/;
  const exportFromRe = /^\s*export\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+from)\s+['"]([^'"]+)['"]/;
  const fnRe = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/;
  const arrowFnRe = /^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/;
  const classRe = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/;
  const interfaceRe = /^(?:export\s+)?interface\s+(\w+)/;
  const typeRe = /^(?:export\s+)?type\s+(\w+)/;
  const methodRe = /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::|\{)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    const importMatch = line.match(importRe);
    if (importMatch?.[1]) imports.push(importMatch[1]);

    const exportFromMatch = line.match(exportFromRe);
    if (exportFromMatch?.[1]) exports.push(exportFromMatch[1]);

    const fnMatch = line.match(fnRe);
    if (fnMatch?.[1]) {
      symbols.push({ name: fnMatch[1], kind: "function", line: lineNum });
      if (line.includes("export")) exports.push(fnMatch[1]);
    }

    const arrowMatch = line.match(arrowFnRe);
    if (arrowMatch?.[1]) {
      symbols.push({ name: arrowMatch[1], kind: "function", line: lineNum });
      if (line.includes("export")) exports.push(arrowMatch[1]);
    }

    const classMatch = line.match(classRe);
    if (classMatch?.[1]) {
      symbols.push({ name: classMatch[1], kind: "class", line: lineNum });
      if (line.includes("export")) exports.push(classMatch[1]);
    }

    const ifaceMatch = line.match(interfaceRe);
    if (ifaceMatch?.[1]) {
      symbols.push({ name: ifaceMatch[1], kind: "interface", line: lineNum });
      if (line.includes("export")) exports.push(ifaceMatch[1]);
    }

    const typeMatch = line.match(typeRe);
    if (typeMatch?.[1]) {
      symbols.push({ name: typeMatch[1], kind: "type", line: lineNum });
      if (line.includes("export")) exports.push(typeMatch[1]);
    }

    const methodMatch = line.match(methodRe);
    if (methodMatch?.[1] && !["if", "for", "while", "switch", "catch"].includes(methodMatch[1])) {
      symbols.push({ name: methodMatch[1], kind: "method", line: lineNum });
    }
  }

  symbols.sort((a, b) => a.line - b.line);
  for (let i = 0; i < symbols.length; i++) {
    const nextSym = symbols[i + 1];
    symbols[i]!.endLine = nextSym ? Math.max(symbols[i]!.line, nextSym.line - 1) : lines.length;
  }

  return { imports, exports, symbols };
}

function extractPythonSymbols(content: string): {
  imports: string[];
  exports: string[];
  symbols: SymbolInfo[];
} {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: SymbolInfo[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    const importMatch = line.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
    if (importMatch) {
      if (importMatch[1]) imports.push(importMatch[1]);
    }

    const defMatch = line.match(/^def\s+(\w+)/);
    if (defMatch?.[1]) {
      symbols.push({ name: defMatch[1], kind: "function", line: lineNum });
    }

    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch?.[1]) {
      symbols.push({ name: classMatch[1], kind: "class", line: lineNum });
    }
  }

  symbols.sort((a, b) => a.line - b.line);
  for (let i = 0; i < symbols.length; i++) {
    const nextSym = symbols[i + 1];
    symbols[i]!.endLine = nextSym ? Math.max(symbols[i]!.line, nextSym.line - 1) : lines.length;
  }

  return { imports, exports, symbols };
}

function extractGoSymbols(content: string): {
  imports: string[];
  exports: string[];
  symbols: SymbolInfo[];
} {
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: SymbolInfo[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    const importMatch = line.match(/^\s*"([^"]+)"/);
    if (importMatch?.[1]) imports.push(importMatch[1]);

    const funcMatch = line.match(/^func\s+(?:\([^)]*\)\s+)?(\w+)/);
    if (funcMatch?.[1]) {
      const name = funcMatch[1];
      symbols.push({ name, kind: "function", line: lineNum });
      if (name[0] === name[0]?.toUpperCase()) exports.push(name);
    }

    const typeMatch = line.match(/^type\s+(\w+)/);
    if (typeMatch?.[1]) {
      symbols.push({ name: typeMatch[1], kind: "type", line: lineNum });
    }
  }

  symbols.sort((a, b) => a.line - b.line);
  for (let i = 0; i < symbols.length; i++) {
    const nextSym = symbols[i + 1];
    symbols[i]!.endLine = nextSym ? Math.max(symbols[i]!.line, nextSym.line - 1) : lines.length;
  }

  return { imports, exports, symbols };
}

export async function parseFile(filePath: string, workspaceRoot: string): Promise<FileSymbols> {
  const content = await readFile(filePath, "utf-8");
  const language = detectLanguage(filePath);
  const stat = await import("node:fs/promises").then((fs) => fs.stat(filePath));

  let parsed: { imports: string[]; exports: string[]; symbols: SymbolInfo[] } | null = null;
  try {
    const { parse } = await import("./tree-sitter-parser.js");
    parsed = await parse(content, language);
  } catch (err) {
    console.error("Tree-sitter parsing failed, falling back to regex:", err);
  }

  if (!parsed) {
    switch (language) {
      case "python":
        parsed = extractPythonSymbols(content);
        break;
      case "go":
        parsed = extractGoSymbols(content);
        break;
      default:
        parsed = extractTsJsSymbols(content);
    }
  }

  const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");

  return {
    path: relativePath,
    language,
    imports: parsed.imports,
    exports: parsed.exports,
    symbols: parsed.symbols,
    hash: hashContent(content),
    mtime: stat.mtimeMs,
  };
}


export function resolveImport(importPath: string, fromFile: string, workspaceRoot: string): string | null {
  if (importPath.startsWith(".")) {
    const dir = path.dirname(path.join(workspaceRoot, fromFile));
    const resolved = path.resolve(dir, importPath);
    const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (existsSync(candidate)) {
        return path.relative(workspaceRoot, candidate).replace(/\\/g, "/");
      }
    }
    return path.relative(workspaceRoot, resolved).replace(/\\/g, "/");
  }
  return null;
}
