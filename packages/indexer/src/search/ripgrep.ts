import { spawn } from "node:child_process";
import path from "node:path";
import { rgPath } from "@vscode/ripgrep";

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export async function ripgrepSearch(
  query: string,
  workspaceRoot: string,
  options: { maxResults?: number; glob?: string } = {}
): Promise<GrepMatch[]> {
  const { maxResults = 50, glob } = options;

  return new Promise((resolve, reject) => {
    const args = [
      "--json",
      "-i",
      "--max-count", "3",
      "--max-filesize", "1M",
      "-g", "!.git",
      "-g", "!node_modules",
      "-g", "!dist",
      "-g", "!.crayon",
    ];

    if (glob) args.push("-g", glob);
    args.push(query, workspaceRoot);

    const proc = spawn(rgPath, args, { cwd: workspaceRoot });
    const matches: GrepMatch[] = [];
    let buffer = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as {
            type: string;
            data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
          };
          if (parsed.type === "match" && parsed.data?.path?.text) {
            matches.push({
              path: path.relative(workspaceRoot, parsed.data.path.text).replace(/\\/g, "/"),
              line: parsed.data.line_number ?? 0,
              text: parsed.data.lines?.text?.trim() ?? "",
            });
          }
        } catch {
          // skip malformed lines
        }
      }
    });

    proc.on("close", () => resolve(matches.slice(0, maxResults)));
    proc.on("error", reject);
  });
}
