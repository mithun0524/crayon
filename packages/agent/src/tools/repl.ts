import { z } from "zod";
import type { ToolContext } from "../types.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeFile, unlink } from "node:fs/promises";

const execAsync = promisify(exec);

export function createReplTool(ctx: ToolContext) {
  return {
    description: "Run an interactive REPL snippet for Node.js or Python to evaluate code quickly without creating permanent files.",
    parameters: z.object({
      language: z.enum(["node", "python"]).describe("The runtime to use"),
      code: z.string().describe("The code snippet to evaluate"),
    }),
    execute: async ({ language, code }: { language: "node" | "python", code: string }) => {
      // repl runs arbitrary code — the strongest privilege the agent has.
      // Gate it like a dangerous command: never in plan mode, always require
      // approval unless the user has explicitly chosen bypass.
      if (ctx.permissionMode === "plan") {
        return { stdout: "", stderr: "PERMISSION_DENIED: repl is disabled in plan mode", success: false };
      }
      if (ctx.permissionMode !== "bypass") {
        const approved = ctx.approveCommand
          ? await ctx.approveCommand(`repl(${language}):\n${code.slice(0, 400)}`)
          : false;
        if (!approved) {
          return { stdout: "", stderr: "PERMISSION_DENIED_BY_USER", success: false };
        }
      }

      const ext = language === "node" ? "js" : "py";
      const tmpFile = path.join(tmpdir(), `crayon_repl_${Date.now()}.${ext}`);

      try {
        await writeFile(tmpFile, code, "utf-8");
        
        const cmd = language === "node" ? `node ${tmpFile}` : `python ${tmpFile}`;
        const { stdout, stderr } = await execAsync(cmd, { cwd: ctx.workspaceRoot, timeout: 10000 });
        
        return {
          stdout,
          stderr,
          success: !stderr,
        };
      } catch (err: any) {
        return {
          stdout: err.stdout || "",
          stderr: err.stderr || err.message,
          success: false,
        };
      } finally {
        try {
          await unlink(tmpFile);
        } catch {} // ignore cleanup errors
      }
    },
  };
}
