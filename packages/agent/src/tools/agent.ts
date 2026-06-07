import { z } from "zod";
import type { ToolContext } from "../types.js";
import { CrayonAgent } from "../index.js";

export function createAgentTool(ctx: ToolContext) {
  return {
    description: "Delegate a sub-task to an autonomous sub-agent. Use this to explore alternative solutions or perform complex background tasks in parallel.",
    parameters: z.object({
      task: z.string().describe("The objective for the sub-agent"),
    }),
    execute: async ({ task }: { task: string }) => {
      // Create a new instance of CrayonAgent inheriting the parent's configuration
      const subAgent = new CrayonAgent({
        workspaceRoot: ctx.workspaceRoot,
        // Inherit the same model config, but for simplicity we assume it's set in the global context
      });
      
      // In a full implementation, we'd pass down the config. For now, we stub the run.
      // Wait for the sub-agent to finish its task.
      ctx.onEvent?.({ type: "thinking", content: `Spawning sub-agent for task: ${task}` });
      
      try {
        // Run the sub-agent silently without emitting UI events to avoid mixing parent/child output
        const result = await subAgent.run(task, { skipHistory: true });
        return {
          status: "completed",
          result: result.summary,
        };
      } catch (err: any) {
        return {
          status: "failed",
          error: err.message,
        };
      }
    },
  };
}
