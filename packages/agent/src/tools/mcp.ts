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

export class McpClient {
  private servers: Map<string, Client> = new Map();
  private serverConfigs: McpServerConfig[];

  constructor(servers: McpServerConfig[] = []) {
    this.serverConfigs = servers;
  }

  async connectAll(): Promise<void> {
    for (const config of this.serverConfigs) {
      try {
        const env: Record<string, string> = {};
        for (const [k, v] of Object.entries(process.env)) {
          if (v !== undefined) env[k] = v;
        }
        for (const [k, v] of Object.entries(config.env || {})) {
          env[k] = v;
        }

        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env,
        });

        const client = new Client(
          { name: "crayon-agent", version: "0.2.0" },
          { capabilities: {} }
        );

        await client.connect(transport);
        this.servers.set(config.name, client);
      } catch (err) {
        console.error(`Crayon: Failed to connect to MCP server ${config.name}`, err);
      }
    }
  }

  async listTools(): Promise<{ server: string; tool: McpTool }[]> {
    const allTools: { server: string; tool: McpTool }[] = [];
    
    for (const [serverName, client] of this.servers.entries()) {
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

  close(): void {
    for (const client of this.servers.values()) {
      // The SDK doesn't have a synchronous close on Client, but usually transports can be closed
      // If client.close exists we'd call it, otherwise ignore.
      if (typeof (client as any).close === 'function') {
        (client as any).close();
      }
    }
    this.servers.clear();
  }
}

