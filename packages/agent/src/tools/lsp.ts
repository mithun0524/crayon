import { z } from "zod";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { LSPServerManager } from "../services/lsp/LSPServerManager.js";

export function createLSPTools(lspManager: LSPServerManager) {
  return {
    lsp_goto_definition: {
      description: "Find the definition of the symbol at the given cursor position using Language Server Protocol (LSP). Useful for navigating codebases, identifying types, or understanding functions.",
      parameters: z.object({
        path: z.string().describe("Relative or absolute path to the file containing the symbol"),
        line: z.number().describe("1-indexed line number of the cursor position"),
        character: z.number().describe("1-indexed character position (column) of the cursor"),
      }),
      execute: async ({ path: filePath, line, character }: { path: string; line: number; character: number }) => {
        const absPath = path.resolve(filePath);
        const server = await lspManager.getServerForFile(absPath);
        if (!server) {
          return { success: false, error: `No active language server found for file extension: ${path.extname(filePath)}` };
        }

        const fileUri = pathToFileURL(absPath).href;
        try {
          const result: any = await server.sendRequest("textDocument/definition", {
            textDocument: { uri: fileUri },
            position: { line: line - 1, character: character - 1 },
          });

          if (!result) return { success: true, locations: [] };

          const parseLocation = (loc: any) => {
            try {
              const targetPath = fileURLToPath(loc.uri || loc.targetUri);
              const range = loc.range || loc.targetSelectionRange || loc.targetRange;
              return {
                path: targetPath,
                line: range.start.line + 1,
                character: range.start.character + 1,
              };
            } catch {
              return null;
            }
          };

          let locations = [];
          if (Array.isArray(result)) {
            locations = result.map(parseLocation).filter(Boolean);
          } else {
            const loc = parseLocation(result);
            if (loc) locations.push(loc);
          }

          return { success: true, locations };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      },
    },

    lsp_find_references: {
      description: "Find all references to the symbol at the given cursor position using Language Server Protocol (LSP).",
      parameters: z.object({
        path: z.string().describe("Relative or absolute path to the file"),
        line: z.number().describe("1-indexed line number"),
        character: z.number().describe("1-indexed character position"),
      }),
      execute: async ({ path: filePath, line, character }: { path: string; line: number; character: number }) => {
        const absPath = path.resolve(filePath);
        const server = await lspManager.getServerForFile(absPath);
        if (!server) {
          return { success: false, error: `No active language server found for file extension: ${path.extname(filePath)}` };
        }

        const fileUri = pathToFileURL(absPath).href;
        try {
          const result: any = await server.sendRequest("textDocument/references", {
            textDocument: { uri: fileUri },
            position: { line: line - 1, character: character - 1 },
            context: { includeDeclaration: true },
          });

          if (!result || !Array.isArray(result)) return { success: true, references: [] };

          const references = result
            .map((loc: any) => {
              try {
                const targetPath = fileURLToPath(loc.uri);
                return {
                  path: targetPath,
                  line: loc.range.start.line + 1,
                  character: loc.range.start.character + 1,
                };
              } catch {
                return null;
              }
            })
            .filter(Boolean);

          return { success: true, references };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      },
    },

    lsp_hover: {
      description: "Get documentation, type information, and signature hints for the symbol at the given cursor position using Language Server Protocol (LSP).",
      parameters: z.object({
        path: z.string().describe("Relative or absolute path to the file"),
        line: z.number().describe("1-indexed line number"),
        character: z.number().describe("1-indexed character position"),
      }),
      execute: async ({ path: filePath, line, character }: { path: string; line: number; character: number }) => {
        const absPath = path.resolve(filePath);
        const server = await lspManager.getServerForFile(absPath);
        if (!server) {
          return { success: false, error: `No active language server found for file extension: ${path.extname(filePath)}` };
        }

        const fileUri = pathToFileURL(absPath).href;
        try {
          const result: any = await server.sendRequest("textDocument/hover", {
            textDocument: { uri: fileUri },
            position: { line: line - 1, character: character - 1 },
          });

          if (!result) return { success: true, contents: "No hover information available." };

          let contents = "";
          const parseContent = (content: any): string => {
            if (typeof content === "string") return content;
            if (content && typeof content === "object") {
              if ("value" in content) return content.value;
              if ("text" in content) return content.text;
            }
            return JSON.stringify(content);
          };

          if (Array.isArray(result.contents)) {
            contents = result.contents.map(parseContent).join("\n\n");
          } else {
            contents = parseContent(result.contents);
          }

          return { success: true, contents };
        } catch (err) {
          return { success: false, error: (err as Error).message };
        }
      },
    },
  };
}
