import { spawn, type ChildProcess } from "node:child_process";
import pkgJsonrpc from "vscode-jsonrpc";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import type {
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver-protocol";

const { createMessageConnection } = pkgJsonrpc;

export interface LSPClient {
  readonly capabilities: ServerCapabilities | undefined;
  readonly isInitialized: boolean;
  start(
    command: string,
    args: string[],
    options?: { env?: Record<string, string>; cwd?: string }
  ): Promise<void>;
  initialize(params: InitializeParams): Promise<InitializeResult>;
  sendRequest<TResult>(method: string, params: unknown): Promise<TResult>;
  sendNotification(method: string, params: unknown): Promise<void>;
  onNotification(method: string, handler: (params: unknown) => void): void;
  onRequest<TParams, TResult>(
    method: string,
    handler: (params: TParams) => TResult | Promise<TResult>
  ): void;
  stop(): Promise<void>;
}

export function createLSPClient(
  serverName: string,
  onCrash?: (error: Error) => void
): LSPClient {
  let childProcess: ChildProcess | undefined;
  let connection: any | undefined;
  let capabilities: ServerCapabilities | undefined;
  let isInitialized = false;
  let startFailed = false;
  let startError: Error | undefined;
  let isStopping = false;

  const pendingHandlers: Array<{
    method: string;
    handler: (params: unknown) => void;
  }> = [];

  const pendingRequestHandlers: Array<{
    method: string;
    handler: (params: unknown) => unknown | Promise<unknown>;
  }> = [];

  function checkStartFailed(): void {
    if (startFailed) {
      throw startError || new Error(`LSP server ${serverName} failed to start`);
    }
  }

  return {
    get capabilities(): ServerCapabilities | undefined {
      return capabilities;
    },

    get isInitialized(): boolean {
      return isInitialized;
    },

    async start(
      command: string,
      args: string[],
      options?: { env?: Record<string, string>; cwd?: string }
    ): Promise<void> {
      try {
        childProcess = spawn(command, args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, ...options?.env },
          cwd: options?.cwd,
          windowsHide: true,
        });

        if (!childProcess.stdout || !childProcess.stdin) {
          throw new Error("LSP server process stdio not available");
        }

        const spawned = childProcess;
        await new Promise<void>((resolve, reject) => {
          const onSpawn = () => {
            cleanup();
            resolve();
          };
          const onError = (error: Error) => {
            cleanup();
            reject(error);
          };
          const cleanup = () => {
            spawned.removeListener("spawn", onSpawn);
            spawned.removeListener("error", onError);
          };
          spawned.once("spawn", onSpawn);
          spawned.once("error", onError);
        });

        if (childProcess.stderr) {
          childProcess.stderr.on("data", (data: Buffer) => {
            const output = data.toString().trim();
            if (output) {
              console.log(`[LSP SERVER ${serverName} STDERR] ${output}`);
            }
          });
        }

        childProcess.on("error", (error) => {
          if (!isStopping) {
            startFailed = true;
            startError = error;
            console.error(`LSP server ${serverName} error: ${error.message}`);
          }
        });

        childProcess.on("exit", (code) => {
          if (code !== 0 && code !== null && !isStopping) {
            isInitialized = false;
            startFailed = false;
            startError = undefined;
            const crashError = new Error(
              `LSP server ${serverName} crashed with exit code ${code}`
            );
            console.error(crashError.message);
            onCrash?.(crashError);
          }
        });

        childProcess.stdin.on("error", (error: Error) => {
          if (!isStopping) {
            console.warn(`LSP server ${serverName} stdin error: ${error.message}`);
          }
        });

        const reader = new StreamMessageReader(childProcess.stdout);
        const writer = new StreamMessageWriter(childProcess.stdin);
        connection = createMessageConnection(reader, writer);

        connection.onError(([error]: [Error]) => {
          if (!isStopping) {
            startFailed = true;
            startError = error;
            console.error(`LSP server ${serverName} connection error: ${error.message}`);
          }
        });

        connection.onClose(() => {
          if (!isStopping) {
            isInitialized = false;
            console.log(`LSP server ${serverName} connection closed`);
          }
        });

        connection.listen();

        for (const { method, handler } of pendingHandlers) {
          connection.onNotification(method, handler);
        }
        pendingHandlers.length = 0;

        for (const { method, handler } of pendingRequestHandlers) {
          connection.onRequest(method, handler);
        }
        pendingRequestHandlers.length = 0;

        console.log(`LSP client started for ${serverName}`);
      } catch (error) {
        const err = error as Error;
        console.error(`LSP server ${serverName} failed to start: ${err.message}`);
        throw error;
      }
    },

    async initialize(params: InitializeParams): Promise<InitializeResult> {
      if (!connection) {
        throw new Error("LSP client not started");
      }
      checkStartFailed();

      try {
        const result: InitializeResult = await connection.sendRequest("initialize", params);
        capabilities = result.capabilities;
        await connection.sendNotification("initialized", {});
        isInitialized = true;
        console.log(`LSP server ${serverName} initialized`);
        return result;
      } catch (error) {
        const err = error as Error;
        console.error(`LSP server ${serverName} initialize failed: ${err.message}`);
        throw error;
      }
    },

    async sendRequest<TResult>(method: string, params: unknown): Promise<TResult> {
      if (!connection) throw new Error("LSP client not started");
      checkStartFailed();
      if (!isInitialized) throw new Error("LSP server not initialized");

      return await connection.sendRequest(method, params);
    },

    async sendNotification(method: string, params: unknown): Promise<void> {
      if (!connection) throw new Error("LSP client not started");
      checkStartFailed();

      try {
        await connection.sendNotification(method, params);
      } catch (error) {
        const err = error as Error;
        console.warn(`LSP server ${serverName} notification ${method} failed: ${err.message}`);
      }
    },

    onNotification(method: string, handler: (params: unknown) => void): void {
      if (!connection) {
        pendingHandlers.push({ method, handler });
        return;
      }
      checkStartFailed();
      connection.onNotification(method, handler);
    },

    onRequest<TParams, TResult>(
      method: string,
      handler: (params: TParams) => TResult | Promise<TResult>
    ): void {
      if (!connection) {
        pendingRequestHandlers.push({
          method,
          handler: handler as (params: unknown) => unknown | Promise<unknown>,
        });
        return;
      }
      checkStartFailed();
      connection.onRequest(method, handler);
    },

    async stop(): Promise<void> {
      isStopping = true;
      try {
        if (connection) {
          await connection.sendRequest("shutdown", {});
          await connection.sendNotification("exit", {});
        }
      } catch (error) {
        const err = error as Error;
        console.warn(`LSP server ${serverName} stop failed: ${err.message}`);
      } finally {
        if (connection) {
          try {
            connection.dispose();
          } catch {}
          connection = undefined;
        }

        if (childProcess) {
          childProcess.removeAllListeners("error");
          childProcess.removeAllListeners("exit");
          if (childProcess.stdin) childProcess.stdin.removeAllListeners("error");
          if (childProcess.stderr) childProcess.stderr.removeAllListeners("data");
          try {
            childProcess.kill();
          } catch {}
          childProcess = undefined;
        }

        isInitialized = false;
        capabilities = undefined;
        isStopping = false;
        console.log(`LSP client stopped for ${serverName}`);
      }
    },
  };
}
