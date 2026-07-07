import { z } from "zod";
import type { ToolContext } from "../types.js";
import { CrayonAgent } from "../index.js";

export function createAgentTool(ctx: ToolContext) {
  return {
    description: "Delegate a sub-task to an autonomous sub-agent. Use this to explore alternative solutions or perform complex background tasks. The sub-agent inherits the current model, provider, and workspace but runs with its own isolated history.",
    parameters: z.object({
      task: z.string().describe("The objective for the sub-agent"),
    }),
    execute: async ({ task }: { task: string }) => {
      const cfg = ctx.modelConfig ?? {};

      // Construct the sub-agent inheriting the parent's model/provider/credentials.
      // allowSubagents is forced off for the child to prevent unbounded recursion.
      const subAgent = new CrayonAgent({
        workspaceRoot: ctx.workspaceRoot,
        model: cfg.model,
        provider: cfg.provider,
        anthropicApiKey: cfg.anthropicApiKey,
        openaiApiKey: cfg.openaiApiKey,
        openrouterApiKey: cfg.openrouterApiKey,
        googleApiKey: cfg.googleApiKey,
        mcpServers: cfg.mcpServers,
        permissionMode: ctx.permissionMode,
        allowSubagents: false,
        // Forward approvals so the sub-agent respects the same permission gates.
        approveCommand: ctx.approveCommand,
        approveEdit: ctx.approveEdit,
      });

      ctx.onEvent?.({ type: "thinking", content: `Spawning sub-agent for task: ${task}` });

      try {
        // Run the sub-agent without polluting the parent's conversation history.
        const result = await subAgent.run(task, { skipHistory: true, signal: ctx.signal });
        return {
          status: result.success ? "completed" : "failed",
          result: result.summary,
          steps: result.steps,
          edits: result.edits,
        };
      } catch (err: any) {
        return {
          status: "failed",
          error: err?.message ?? String(err),
        };
      } finally {
        subAgent.close();
      }
    },
  };
}
