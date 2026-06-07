import { z } from "zod";
import type { ToolContext } from "../types.js";
import fg from "fast-glob";


export function createGlobTool(ctx: ToolContext) {
  return {
    description: "Search for files by path patterns (e.g. src/**/*.ts, *.md). Returns matching file paths. Do NOT use this to search file contents (use search_codebase for that).",
    parameters: z.object({
      pattern: z.string().describe("The glob pattern to search for"),
    }),
    execute: async ({ pattern }: { pattern: string }) => {
      try {
        const matches = await fg(pattern, {
          cwd: ctx.workspaceRoot,
          ignore: ["node_modules/**", ".git/**", "dist/**"],
          onlyFiles: true,
          absolute: false,
        });

        return {
          matches,
          count: matches.length,
          message: matches.length === 0 ? `No files found matching ${pattern}` : `Found ${matches.length} files.`
        };
      } catch (err: any) {
        throw new Error(`Glob search failed: ${err?.message || String(err)}`);
      }
    },
  };
}
