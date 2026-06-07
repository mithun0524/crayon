import { z } from "zod";
import type { ToolContext } from "../types.js";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export function createTodoTool(ctx: ToolContext) {
  const todoPath = path.join(ctx.workspaceRoot, ".crayon.todo");

  return {
    description: "Write or update an internal scratchpad/TODO list to help you plan complex tasks. This file is for your own use to keep track of steps. Use this to break down large tasks before starting execution.",
    parameters: z.object({
      content: z.string().describe("The full markdown content of the TODO list"),
    }),
    execute: async ({ content }: { content: string }) => {
      await writeFile(todoPath, content, "utf-8");
      return {
        status: "saved",
        path: ".crayon.todo",
      };
    },
  };
}
