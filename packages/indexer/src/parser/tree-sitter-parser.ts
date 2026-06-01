import Parser from "web-tree-sitter";
import { createRequire } from "node:module";
import type { SymbolInfo } from "../types.js";

const require = createRequire(import.meta.url);

let parser: Parser | null = null;
const languageCache = new Map<string, Parser.Language>();

export async function initTreeSitter() {
  if (parser) return;
  await Parser.init();
  parser = new Parser();
}

export async function loadLanguage(language: string): Promise<Parser.Language | null> {
  let wasmName = "";
  switch (language) {
    case "typescript": wasmName = "typescript"; break;
    case "javascript": wasmName = "javascript"; break;
    case "python": wasmName = "python"; break;
    case "go": wasmName = "go"; break;
    case "rust": wasmName = "rust"; break;
    case "java": wasmName = "java"; break;
    default: return null;
  }

  if (languageCache.has(wasmName)) {
    return languageCache.get(wasmName)!;
  }

  try {
    const wasmPath = require.resolve(`tree-sitter-wasms/out/tree-sitter-${wasmName}.wasm`);
    const lang = await Parser.Language.load(wasmPath);
    languageCache.set(wasmName, lang);
    return lang;
  } catch (error) {
    console.error(`Failed to load tree-sitter wasm for ${language}:`, error);
    return null;
  }
}

export async function parse(
  content: string,
  language: string
): Promise<{ imports: string[]; exports: string[]; symbols: SymbolInfo[] } | null> {
  await initTreeSitter();
  const lang = await loadLanguage(language);
  if (!lang) return null;

  parser!.setLanguage(lang);
  const tree = parser!.parse(content);
  
  const imports: string[] = [];
  const exports: string[] = [];
  const symbols: SymbolInfo[] = [];

  function visit(node: Parser.SyntaxNode) {
    // Collect Imports
    if (language === "typescript" || language === "javascript") {
      if (node.type === "import_statement") {
        const source = node.childForFieldName("source");
        if (source && source.type === "string") {
          imports.push(source.text.slice(1, -1));
        }
      }
      if (node.type === "export_statement") {
        const source = node.childForFieldName("source");
        if (source && source.type === "string") {
          exports.push(source.text.slice(1, -1));
        }
        // Also capture exported names if needed, but regex parser in symbols.ts does some of this
        // For simplicity, we just collect what we can.
      }
    } else if (language === "python") {
      if (node.type === "import_statement" || node.type === "import_from_statement") {
        const moduleName = node.childForFieldName("module_name");
        if (moduleName) imports.push(moduleName.text);
      }
    } else if (language === "go") {
      if (node.type === "import_spec") {
        const path = node.childForFieldName("path");
        if (path) imports.push(path.text.slice(1, -1));
      }
    }

    // Collect Symbols
    let nameNode: Parser.SyntaxNode | null = null;
    let kind: SymbolInfo["kind"] | null = null;

    if (node.type === "function_declaration" || node.type === "generator_function_declaration" || node.type === "arrow_function") {
      nameNode = node.childForFieldName("name") || node.childForFieldName("left"); // arrow_function might be assigned
      kind = "function";
    } else if (node.type === "method_definition") {
      nameNode = node.childForFieldName("name");
      kind = "method";
    } else if (node.type === "class_declaration") {
      nameNode = node.childForFieldName("name");
      kind = "class";
    } else if (node.type === "interface_declaration") {
      nameNode = node.childForFieldName("name");
      kind = "interface";
    } else if (node.type === "type_alias_declaration") {
      nameNode = node.childForFieldName("name");
      kind = "type";
    } else if (language === "python") {
      if (node.type === "function_definition") {
        nameNode = node.childForFieldName("name");
        kind = "function";
      } else if (node.type === "class_definition") {
        nameNode = node.childForFieldName("name");
        kind = "class";
      }
    } else if (language === "go") {
      if (node.type === "function_declaration" || node.type === "method_declaration") {
        nameNode = node.childForFieldName("name");
        kind = "function";
      } else if (node.type === "type_spec") {
        nameNode = node.childForFieldName("name");
        kind = "type";
      }
    } else if (language === "rust") {
      if (node.type === "function_item") {
        nameNode = node.childForFieldName("name");
        kind = "function";
      } else if (["struct_item", "enum_item", "trait_item"].includes(node.type)) {
        nameNode = node.childForFieldName("name");
        kind = "type"; // or interface/class roughly
      }
    } else if (language === "java") {
      if (node.type === "method_declaration") {
        nameNode = node.childForFieldName("name");
        kind = "method";
      } else if (node.type === "class_declaration" || node.type === "interface_declaration" || node.type === "enum_declaration") {
        nameNode = node.childForFieldName("name");
        kind = node.type === "interface_declaration" ? "interface" : "class";
      }
    }

    if (kind && nameNode) {
      symbols.push({
        name: nameNode.text,
        kind,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
      // Check if it's exported
      if (node.parent?.type === "export_statement") {
        exports.push(nameNode.text);
      }
    }

    // arrow functions in variable declarators
    if ((language === "typescript" || language === "javascript") && node.type === "variable_declarator") {
      const value = node.childForFieldName("value");
      if (value && value.type === "arrow_function") {
        const name = node.childForFieldName("name");
        if (name) {
          symbols.push({
            name: name.text,
            kind: "function",
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
          });
          if (node.parent?.parent?.type === "export_statement" || node.parent?.parent?.parent?.type === "export_statement") {
            exports.push(name.text);
          }
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      visit(node.child(i)!);
    }
  }

  visit(tree.rootNode);
  
  // Sort by line just in case
  symbols.sort((a, b) => a.line - b.line);
  
  return { imports, exports, symbols };
}
