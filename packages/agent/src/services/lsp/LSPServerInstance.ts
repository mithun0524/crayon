import { pathToFileURL } from "node:url";
import { createLSPClient, type LSPClient } from "./LSPClient.js";
import type { InitializeParams } from "vscode-languageserver-protocol";

export type LspServerState = "stopped" | "starting" | "running" | "error";

export interface LspServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  workspaceFolder?: string;
  extensionToLanguage: Record<string, string>;
  initializationOptions?: any;
}

export interface LSPServerInstance {
  readonly name: string;
  readonly config: LspServerConfig;
  readonly state: LspServerState;
  readonly diagnostics: Map<string, any[]>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendRequest<T>(method: string, params: unknown): Promise<T>;
  sendNotification(method: string, params: unknown): Promise<void>;
  onNotification(method: string, handler: (params: unknown) => void): void;
  onRequest<TParams, TResult>(
    method: string,
    handler: (params: TParams) => TResult | Promise<TResult>
  ): void;
}

export function createLSPServerInstance(
  name: string,
  config: LspServerConfig
): LSPServerInstance {
  let state: LspServerState = "stopped";
  const diagnostics = new Map<string, any[]>();

  const client: LSPClient = createLSPClient(name, () => {
    state = "error";
  });

  return {
    get name() {
      return name;
    },

    get config() {
      return config;
    },

    get state() {
      return state;
    },

    get diagnostics() {
      return diagnostics;
    },

    async start(): Promise<void> {
      if (state === "running" || state === "starting") return;
      state = "starting";

      try {
        await client.start(config.command, config.args || [], {
          env: config.env,
          cwd: config.workspaceFolder,
        });

        const workspaceFolder = config.workspaceFolder || process.cwd();
        const workspaceUri = pathToFileURL(workspaceFolder).href;

        const initParams: InitializeParams = {
          processId: process.pid,
          initializationOptions: config.initializationOptions ?? {},
          workspaceFolders: [
            {
              uri: workspaceUri,
              name: "workspace",
            },
          ],
          rootPath: workspaceFolder,
          rootUri: workspaceUri,
          capabilities: {
            textDocument: {
              synchronization: {
                dynamicRegistration: false,
                willSave: false,
                willSaveWaitUntil: false,
                didSave: true,
              },
              publishDiagnostics: {
                relatedInformation: true,
              },
              definition: {
                dynamicRegistration: false,
                linkSupport: true,
              },
              references: {
                dynamicRegistration: false,
              },
              hover: {
                dynamicRegistration: false,
                contentFormat: ["markdown", "plaintext"],
              },
            },
          },
        };

        await client.initialize(initParams);
        state = "running";

        client.onNotification("textDocument/publishDiagnostics", (params: any) => {
          if (params && params.uri && Array.isArray(params.diagnostics)) {
            // Keep local diagnostics list updated
            diagnostics.set(params.uri, params.diagnostics);
          }
        });
      } catch (err) {
        state = "error";
        throw err;
      }
    },

    async stop(): Promise<void> {
      state = "stopped";
      diagnostics.clear();
      await client.stop();
    },

    async sendRequest<T>(method: string, params: unknown): Promise<T> {
      if (state !== "running") {
        await this.start();
      }
      return await client.sendRequest<T>(method, params);
    },

    async sendNotification(method: string, params: unknown): Promise<void> {
      if (state !== "running") {
        await this.start();
      }
      await client.sendNotification(method, params);
    },

    onNotification(method: string, handler: (params: unknown) => void): void {
      client.onNotification(method, handler);
    },

    onRequest<TParams, TResult>(
      method: string,
      handler: (params: TParams) => TResult | Promise<TResult>
    ): void {
      client.onRequest(method, handler);
    },
  };
}
