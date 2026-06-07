import { z } from "zod";
import type { ToolContext } from "../types.js";

export function createAskUserTool(ctx: ToolContext) {
  return {
    description: "Ask the user a question to gather information, clarify a requirement, or get a decision. Use this ONLY when you are blocked and cannot proceed without user input. Do not use this to narrate your progress.",
    parameters: z.object({
      question: z.string().describe("The question you want to ask the user"),
    }),
    execute: async ({ question }: { question: string }) => {
      // Pause execution and ask the user
      // In Crayon, we emit a question event and expect the CLI to handle it,
      // but since the current Agent interface doesn't natively yield for prompt,
      // we might need to rely on throwing a special error or returning a signal.
      // For now, we will return a string instructing the agent to stop and wait.
      ctx.onEvent?.({ type: "text", content: `\n[Agent Question]: ${question}\n` });
      return { 
        status: "waiting_for_user",
        message: "You have asked the user a question. Stop executing tools and wait for their reply in the next turn." 
      };
    },
  };
}
