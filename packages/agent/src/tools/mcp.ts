// MCP client stub for v0.2
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
  constructor(_servers: McpServerConfig[] = []) {
    void _servers;
  }

  async connect(_config: McpServerConfig): Promise<void> {
    throw new Error("MCP support coming in v0.2");
  }

  async listTools(): Promise<McpTool[]> {
    return [];
  }

  async callTool(_name: string, _args: unknown): Promise<unknown> {
    throw new Error("MCP support coming in v0.2");
  }
}
