import { z } from "zod";
import type { ToolContext } from "../types.js";

export function createAskUserTool(ctx: ToolContext) {
  return {
    description: "Ask the user a question to gather information, clarify a requirement, or get a decision. Use this ONLY when you are blocked and cannot proceed without user input. Do not use this to narrate your progress.",
    parameters: z.object({
      question: z.string().describe("The question you want to ask the user"),
    }),
    execute: async ({ question }: { question: string }) => {
      // Interactive path: if the host provides an askUser callback, block for a
      // real answer (the host applies a timeout that returns a "proceed anyway"
      // string rather than hanging). This lets the agent CONTINUE in the same
      // run with the answer, instead of ending the turn.
      if (ctx.askUser) {
        try {
          const answer = await ctx.askUser(question);
          return { status: "answered", answer };
        } catch {
          // Fall through to stop-and-wait if the host errored.
        }
      }
      // Fallback (no interactive host): emit the question and stop for next turn.
      ctx.onEvent?.({ type: "text", content: `\n[Agent Question]: ${question}\n` });
      return {
        status: "waiting_for_user",
        message: "You have asked the user a question. Stop executing tools and wait for their reply in the next turn.",
      };
    },
  };
}
