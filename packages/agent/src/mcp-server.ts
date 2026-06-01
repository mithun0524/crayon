import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createTools } from "./tools/index.js";
import { CodeIndexer } from "crayon-indexer";
import type { ToolContext } from "./types.js";

export async function runMcpServer() {
  const workspaceRoot = process.cwd();
  const indexer = new CodeIndexer(workspaceRoot);
  await indexer.init();

  const ctx: ToolContext = {
    workspaceRoot,
    indexer,
    permissionMode: "auto", // Allow execution through MCP if requested, or bypass
  };

  const allTools = createTools(ctx);
  const exposedTools = ["edit_file", "read_file", "terminal", "search_codebase"];

  const server = new Server(
    {
      name: "crayon-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: exposedTools.map((name) => {
        const toolDef = (allTools as any)[name];
        // Convert zod schema to JSON schema manually or using zod-to-json-schema if available,
        // but since we only have zod, we can do a simple mapping or just use a basic JSON schema.
        // Actually, we can use zodToJsonSchema if we install it, but we can also manually write the schemas.
        // Wait, tools in `createTools` have a `.parameters` (zod schema) and `.description`.
        
        let properties: Record<string, any> = {};
        let required: string[] = [];

        // Manual schema extraction for the 4 tools:
        if (name === "read_file") {
          properties = {
            path: { type: "string", description: "Relative path to the file" },
            start_line: { type: "number", description: "Start line (1-indexed)" },
            end_line: { type: "number", description: "End line (1-indexed)" }
          };
          required = ["path"];
        } else if (name === "edit_file") {
          properties = {
            path: { type: "string", description: "Relative path to the file" },
            old_string: { type: "string", description: "Exact text to find and replace" },
            new_string: { type: "string", description: "Replacement text" }
          };
          required = ["path", "old_string", "new_string"];
        } else if (name === "terminal") {
          properties = {
            command: { type: "string", description: "Shell command to execute" },
            timeout_ms: { type: "number", description: "Timeout in milliseconds" },
            cwd: { type: "string", description: "Working directory" }
          };
          required = ["command"];
        } else if (name === "search_codebase") {
          properties = {
            query: { type: "string", description: "Natural language or symbol name to search for" }
          };
          required = ["query"];
        }

        return {
          name,
          description: toolDef.description,
          inputSchema: {
            type: "object",
            properties,
            required,
          },
        };
      }),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments || {};

    if (!exposedTools.includes(name)) {
      throw new Error(`Tool not found: ${name}`);
    }

    const toolDef = (allTools as any)[name];
    try {
      const result = await toolDef.execute(args);
      return {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Crayon MCP server running on stdio");
}
