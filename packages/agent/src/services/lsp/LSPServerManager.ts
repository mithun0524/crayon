import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createLSPServerInstance, type LSPServerInstance, type LspServerConfig } from "./LSPServerInstance.js";

const DEFAULT_CONFIGS: Record<string, LspServerConfig> = {
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    extensionToLanguage: {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact",
      ".mjs": "javascript",
      ".cjs": "javascript",
    },
  },
  gopls: {
    command: "gopls",
    extensionToLanguage: {
      ".go": "go",
    },
  },
  pyright: {
    command: "pyright-langserver",
    args: ["--stdio"],
    extensionToLanguage: {
      ".py": "python",
    },
  },
  rust: {
    command: "rust-analyzer",
    extensionToLanguage: {
      ".rs": "rust",
    },
  },
};

export interface LSPServerManager {
  openFile(filePath: string, content: string): Promise<void>;
  changeFile(filePath: string, content: string): Promise<void>;
  saveFile(filePath: string): Promise<void>;
  closeFile(filePath: string): Promise<void>;
  shutdown(): Promise<void>;
  getDiagnostics(): Array<{ filePath: string; diagnostics: any[] }>;
  getServerForFile(filePath: string): Promise<LSPServerInstance | undefined>;
}

export function createLSPServerManager(workspaceRoot: string): LSPServerManager {
  const servers = new Map<string, LSPServerInstance>();
  const openedFiles = new Set<string>(); // Tracks open file URIs

  async function ensureServerStarted(filePath: string): Promise<LSPServerInstance | undefined> {
    const ext = path.extname(filePath).toLowerCase();
    let serverName: string | undefined;
    for (const [name, config] of Object.entries(DEFAULT_CONFIGS)) {
      if (ext in config.extensionToLanguage) {
        serverName = name;
        break;
      }
    }
    if (!serverName) return undefined;

    let instance = servers.get(serverName);
    if (!instance) {
      const config = { ...DEFAULT_CONFIGS[serverName], workspaceFolder: workspaceRoot };
      instance = createLSPServerInstance(serverName, config);
      servers.set(serverName, instance);
    }

    if (instance.state === "stopped") {
      try {
        await instance.start();
      } catch (err) {
        console.warn(`LSP Server ${serverName} failed to start, skipping: ${(err as Error).message}`);
        return undefined;
      }
    }

    if (instance.state === "error") {
      return undefined;
    }

    return instance;
  }

  return {
    async openFile(filePath: string, content: string): Promise<void> {
      const fileUri = pathToFileURL(path.resolve(filePath)).href;
      if (openedFiles.has(fileUri)) return;

      const server = await ensureServerStarted(filePath);
      if (!server || server.state !== "running") return;

      const ext = path.extname(filePath).toLowerCase();
      const languageId = server.config.extensionToLanguage[ext] || "plaintext";

      try {
        await server.sendNotification("textDocument/didOpen", {
          textDocument: {
            uri: fileUri,
            languageId,
            version: 1,
            text: content,
          },
        });
        openedFiles.add(fileUri);
      } catch (err) {
        console.warn(`LSP didOpen failed for ${filePath}: ${(err as Error).message}`);
      }
    },

    async changeFile(filePath: string, content: string): Promise<void> {
      const fileUri = pathToFileURL(path.resolve(filePath)).href;
      const server = await ensureServerStarted(filePath);
      if (!server || server.state !== "running") return;

      if (!openedFiles.has(fileUri)) {
        await this.openFile(filePath, content);
        return;
      }

      try {
        await server.sendNotification("textDocument/didChange", {
          textDocument: {
            uri: fileUri,
            version: 1,
          },
          contentChanges: [{ text: content }],
        });
      } catch (err) {
        console.warn(`LSP didChange failed for ${filePath}: ${(err as Error).message}`);
      }
    },

    async saveFile(filePath: string): Promise<void> {
      const fileUri = pathToFileURL(path.resolve(filePath)).href;
      const server = await ensureServerStarted(filePath);
      if (!server || server.state !== "running") return;

      try {
        await server.sendNotification("textDocument/didSave", {
          textDocument: {
            uri: fileUri,
          },
        });
      } catch (err) {
        console.warn(`LSP didSave failed for ${filePath}: ${(err as Error).message}`);
      }
    },

    async closeFile(filePath: string): Promise<void> {
      const fileUri = pathToFileURL(path.resolve(filePath)).href;
      if (!openedFiles.has(fileUri)) return;

      const server = await ensureServerStarted(filePath);
      if (!server || server.state !== "running") return;

      try {
        await server.sendNotification("textDocument/didClose", {
          textDocument: {
            uri: fileUri,
          },
        });
        openedFiles.delete(fileUri);
      } catch (err) {
        console.warn(`LSP didClose failed for ${filePath}: ${(err as Error).message}`);
      }
    },

    async shutdown(): Promise<void> {
      const activeServers = Array.from(servers.values());
      servers.clear();
      openedFiles.clear();

      await Promise.all(activeServers.map(s => s.stop().catch(() => {})));
    },

    getDiagnostics(): Array<{ filePath: string; diagnostics: any[] }> {
      const result: Array<{ filePath: string; diagnostics: any[] }> = [];
      for (const server of servers.values()) {
        for (const [uri, diags] of server.diagnostics.entries()) {
          if (diags.length > 0) {
            try {
              const filePath = fileURLToPath(uri);
              result.push({ filePath, diagnostics: diags });
            } catch {}
          }
        }
      }
      return result;
    },

    async getServerForFile(filePath: string): Promise<LSPServerInstance | undefined> {
      return await ensureServerStarted(filePath);
    },
  };
}
