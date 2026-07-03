import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpClientOptions {
  /** Connection timeout per server in milliseconds (default: 30000) */
  connectTimeoutMs?: number;
  /** Called when a server fails to connect */
  onError?: (serverName: string, error: Error) => void;
}

export class McpClient {
  private servers: Map<string, Client> = new Map();
  private serverConfigs: McpServerConfig[];
  private options: McpClientOptions;

  constructor(servers: McpServerConfig[] = [], options: McpClientOptions = {}) {
    this.serverConfigs = servers;
    this.options = options;
  }

  async connectAll(): Promise<void> {
    const timeout = this.options.connectTimeoutMs ?? 30_000;

    for (const config of this.serverConfigs) {
      try {
        // Do NOT forward the whole environment — that leaks our LLM provider
        // keys to every MCP subprocess. Pass a minimal base plus the server's
        // own declared env, and strip anything key/secret/token-looking.
        const SECRET_RE = /(_KEY|_TOKEN|_SECRET|PASSWORD|APIKEY|CREDENTIAL)/i;
        const env: Record<string, string> = {};
        const BASE_VARS = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM", "TMPDIR", "SystemRoot", "APPDATA", "ProgramFiles", "ProgramData"];
        for (const k of BASE_VARS) {
          const v = process.env[k];
          if (v !== undefined && !SECRET_RE.test(k)) env[k] = v;
        }
        // The server's explicitly-declared env is trusted (user-configured).
        for (const [k, v] of Object.entries(config.env || {})) {
          env[k] = v;
        }
        const isWin = process.platform === "win32";
        let resolvedCommand = config.command;
        if (isWin && (resolvedCommand === "npx" || resolvedCommand === "npm")) {
          resolvedCommand += ".cmd";
        }

        const transport = new StdioClientTransport({
          command: resolvedCommand,
          args: config.args || [],
          env,
          stderr: "ignore",
        });

        const client = new Client(
          { name: "crayon-agent", version: "0.2.0" },
          { capabilities: {} }
        );

        // Race between connect and timeout
        await Promise.race([
          client.connect(transport),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Connection timed out after ${timeout / 1000}s`)), timeout)
          ),
        ]);

        this.servers.set(config.name, client);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // Surface through callback instead of console.error
        if (this.options.onError) {
          this.options.onError(config.name, error);
        }
        // Don't add to this.servers — the server is not connected
      }
    }
  }

  async listTools(): Promise<{ server: string; tool: McpTool }[]> {
    const allTools: { server: string; tool: McpTool }[] = [];
    
    for (const [serverName, client] of this.servers.entries()) {
      try {
        const response = await client.listTools();
        for (const t of response.tools) {
          allTools.push({
            server: serverName,
            tool: {
              name: t.name,
              description: t.description || "",
              inputSchema: t.inputSchema,
            }
          });
        }
      } catch (err) {
        // One server failing to list tools shouldn't break others
        const error = err instanceof Error ? err : new Error(String(err));
        if (this.options.onError) {
          this.options.onError(serverName, error);
        }
        // Remove the broken server so we don't try to call tools on it
        this.servers.delete(serverName);
      }
    }
    
    return allTools;
  }

  async callTool(serverName: string, name: string, args: any): Promise<unknown> {
    const client = this.servers.get(serverName);
    if (!client) {
      throw new Error(`MCP server ${serverName} not connected.`);
    }

    const response = await client.callTool({
      name,
      arguments: args,
    });

    return response;
  }

  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    for (const client of this.servers.values()) {
      try {
        if (typeof (client as any).close === 'function') {
          closePromises.push(
            Promise.resolve((client as any).close()).catch(() => {})
          );
        }
      } catch {
        // Ignore close errors
      }
    }
    await Promise.allSettled(closePromises);
    this.servers.clear();
  }
}
