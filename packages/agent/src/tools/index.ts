import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createTwoFilesPatch } from "diff";
import { simpleGit } from "simple-git";
import { z } from "zod";
import { Project } from "ts-morph";
import type { ToolContext } from "../types.js";

const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /rmdir\s+\/s/i,
  /del\s+\/f/i,
  /format\s+/i,
  /shutdown/i,
  /mkfs/i,
  /:\(\)\s*\{\s*:\|:&\s*\}/,
  />\s*\/dev\/sd/,
];

export function createTools(ctx: ToolContext) {
  const resolvePath = (filePath: string) => {
    const resolved = path.resolve(ctx.workspaceRoot, filePath);
    if (!resolved.startsWith(ctx.workspaceRoot)) {
      throw new Error(`Path escapes workspace: ${filePath}`);
    }
    return resolved;
  };

  return {
    thinking: {
      description: "Reason through a problem before acting. Use for planning and analysis — not for final user-facing replies.",
      parameters: z.object({
        thought: z.string().describe("Internal reasoning or analysis"),
      }),
      execute: async ({ thought }: { thought: string }) => {
        ctx.onEvent?.({ type: "thinking", content: thought });
        return { ok: true };
      },
    },

    read_file: {
      description: "Read a file from the workspace. Optionally specify start and end line numbers.",
      parameters: z.object({
        path: z.string().describe("Relative path to the file"),
        start_line: z.number().optional().describe("Start line (1-indexed)"),
        end_line: z.number().optional().describe("End line (1-indexed)"),
      }),
      execute: async ({ path: filePath, start_line, end_line }: { path: string; start_line?: number; end_line?: number }) => {
        const absPath = resolvePath(filePath);
        const content = await readFile(absPath, "utf-8");
        const lines = content.split("\n");

        if (start_line !== undefined || end_line !== undefined) {
          const start = (start_line ?? 1) - 1;
          const end = end_line ?? lines.length;
          const slice = lines.slice(start, end);
          return {
            path: filePath,
            content: slice.map((l, i) => `${start + i + 1}|${l}`).join("\n"),
            totalLines: lines.length,
          };
        }

        return {
          path: filePath,
          content: lines.map((l, i) => `${i + 1}|${l}`).join("\n"),
          totalLines: lines.length,
        };
      },
    },

    edit_file: {
      description: "Edit an existing file using search/replace. old_string must match exactly once in the file.",
      parameters: z.object({
        path: z.string().describe("Relative path to the file"),
        old_string: z.string().describe("Exact text to find and replace"),
        new_string: z.string().describe("Replacement text"),
      }),
      execute: async ({ path: filePath, old_string, new_string }: { path: string; old_string: string; new_string: string }) => {
        const absPath = resolvePath(filePath);
        if (!existsSync(absPath)) {
          return { success: false, error: `File not found: ${filePath}. Use write_file for new files.` };
        }

        const content = await readFile(absPath, "utf-8");
        const occurrences = content.split(old_string).length - 1;

        if (occurrences === 0) {
          return { success: false, error: "old_string not found in file" };
        }
        if (occurrences > 1) {
          return { success: false, error: `old_string found ${occurrences} times. Provide more context to make it unique.` };
        }

        const newContent = content.replace(old_string, new_string);
        
        if (ctx.approveEdit) {
          const approved = await ctx.approveEdit(filePath, newContent);
          if (!approved) {
            return { success: false, error: "Edit rejected by user" };
          }
        }

        const diff = createTwoFilesPatch(filePath, filePath, content, newContent);
        await writeFile(absPath, newContent, "utf-8");

        ctx.onEvent?.({ type: "edit", path: filePath, diff });

        return { success: true, path: filePath, diff };
      },
    },

    edit_ast: {
      description: "Replace the entire body of a TypeScript/JavaScript function or class using ts-morph. Prefer over edit_file for large files.",
      parameters: z.object({
        path: z.string().describe("Relative path to the file"),
        symbol_name: z.string().describe("Name of the function, class, or method to replace"),
        new_content: z.string().describe("The **complete** new code for this symbol, including its declaration (e.g. 'function doX() { ... }')"),
      }),
      execute: async ({ path: filePath, symbol_name, new_content }: { path: string; symbol_name: string; new_content: string }) => {
        const absPath = resolvePath(filePath);
        if (!existsSync(absPath)) {
          return { success: false, error: `File not found: ${filePath}.` };
        }

        const project = new Project({ useInMemoryFileSystem: true });
        const content = await readFile(absPath, "utf-8");
        const sourceFile = project.createSourceFile(absPath, content);

        // Find the node
        let targetNode: any = null;
        
        for (const dec of sourceFile.getClasses()) {
          if (dec.getName() === symbol_name) targetNode = dec;
          for (const method of dec.getMethods()) {
            if (method.getName() === symbol_name) targetNode = method;
          }
        }
        if (!targetNode) {
          for (const dec of sourceFile.getFunctions()) {
            if (dec.getName() === symbol_name) targetNode = dec;
          }
        }
        if (!targetNode) {
          for (const dec of sourceFile.getVariableDeclarations()) {
            if (dec.getName() === symbol_name) targetNode = dec;
          }
        }
        if (!targetNode) {
          for (const dec of sourceFile.getInterfaces()) {
            if (dec.getName() === symbol_name) targetNode = dec;
          }
        }

        if (!targetNode) {
          return { success: false, error: `Symbol not found: ${symbol_name}` };
        }

        // We replace the node with new content
        targetNode.replaceWithText(new_content);
        const newContent = sourceFile.getFullText();

        if (ctx.approveEdit) {
          const approved = await ctx.approveEdit(filePath, newContent);
          if (!approved) {
            return { success: false, error: "Edit rejected by user" };
          }
        }

        const diff = createTwoFilesPatch(filePath, filePath, content, newContent);
        await writeFile(absPath, newContent, "utf-8");

        ctx.onEvent?.({ type: "edit", path: filePath, diff });

        return { success: true, path: filePath, diff };
      },
    },

    write_file: {
      description: "Create a new file. Cannot overwrite existing files — use edit_file instead.",
      parameters: z.object({
        path: z.string().describe("Relative path for the new file"),
        content: z.string().describe("File content"),
      }),
      execute: async ({ path: filePath, content }: { path: string; content: string }) => {
        const absPath = resolvePath(filePath);
        if (existsSync(absPath)) {
          return { success: false, error: `File already exists: ${filePath}. Use edit_file to modify.` };
        }

        await mkdir(path.dirname(absPath), { recursive: true });
        await writeFile(absPath, content, "utf-8");

        ctx.onEvent?.({ type: "edit", path: filePath, diff: `+ Created new file: ${filePath}` });

        return { success: true, path: filePath, created: true };
      },
    },

    grep: {
      description: "Search for a pattern in the codebase using ripgrep.",
      parameters: z.object({
        pattern: z.string().describe("Search pattern (regex supported)"),
        glob: z.string().optional().describe("File glob filter, e.g. '*.ts'"),
      }),
      execute: async ({ pattern }: { pattern: string; glob?: string }) => {
        const results = await ctx.indexer.search(pattern, 30);
        return {
          matches: results
            .filter((r) => r.matchType === "grep" || r.snippet)
            .map((r) => ({
              path: r.path,
              line: r.line,
              snippet: r.snippet,
            })),
        };
      },
    },

    search_codebase: {
      description: "Hybrid search: symbols + ripgrep + dependency graph. Best for finding relevant code.",
      parameters: z.object({
        query: z.string().describe("Natural language or symbol name to search for"),
      }),
      execute: async ({ query }: { query: string }) => {
        const results = await ctx.indexer.search(query, 20);
        return {
          results: results.map((r) => ({
            path: r.path,
            score: r.score,
            matchType: r.matchType,
            line: r.line,
            symbol: r.symbol,
            snippet: r.snippet,
          })),
        };
      },
    },

    list_directory: {
      description: "List files and directories in a path.",
      parameters: z.object({
        path: z.string().default(".").describe("Relative directory path"),
        depth: z.number().default(1).describe("Recursion depth"),
      }),
      execute: async ({ path: dirPath, depth }: { path?: string; depth?: number }) => {
        const absPath = resolvePath(dirPath ?? ".");
        const entries = await listDirRecursive(absPath, ctx.workspaceRoot, depth ?? 1);
        return { path: dirPath ?? ".", entries };
      },
    },

    terminal: {
      description: "Run a shell command in the workspace directory. Dangerous commands require approval.",
      parameters: z.object({
        command: z.string().describe("Shell command to execute"),
        timeout_ms: z.number().default(60000).describe("Timeout in milliseconds"),
      }),
      execute: async ({ command, timeout_ms }: { command: string; timeout_ms?: number }) => {
        for (const pattern of DANGEROUS_PATTERNS) {
          if (pattern.test(command)) {
            if (ctx.approveCommand) {
              const approved = await ctx.approveCommand(command);
              if (!approved) {
                return { success: false, error: "Command rejected by user", command };
              }
            } else {
              return { success: false, error: "Dangerous command blocked. Approval required.", command };
            }
          }
        }

        return runCommand(command, ctx.workspaceRoot, timeout_ms ?? 60000);
      },
    },

    git_status: {
      description: "Get git status of the workspace.",
      parameters: z.object({}),
      execute: async () => {
        const git = simpleGit(ctx.workspaceRoot);
        const status = await git.status();
        return {
          branch: status.current,
          staged: status.staged,
          modified: status.modified,
          untracked: status.not_added,
          ahead: status.ahead,
          behind: status.behind,
        };
      },
    },

    git_diff: {
      description: "Get git diff for the workspace or a specific file.",
      parameters: z.object({
        path: z.string().optional().describe("Optional file path"),
      }),
      execute: async ({ path: filePath }: { path?: string }) => {
        const git = simpleGit(ctx.workspaceRoot);
        const diff = filePath
          ? await git.diff([filePath])
          : await git.diff();
        return { diff: diff.slice(0, 10000) };
      },
    },

    git_commit: {
      description: "Stage all changes and commit with a message.",
      parameters: z.object({
        message: z.string().describe("Commit message"),
      }),
      execute: async ({ message }: { message: string }) => {
        const git = simpleGit(ctx.workspaceRoot);
        await git.add(".");
        const result = await git.commit(message);
        return { success: true, hash: result.commit, summary: result.summary };
      },
    },
  };
}

async function listDirRecursive(
  absPath: string,
  workspaceRoot: string,
  maxDepth: number,
  currentDepth = 0
): Promise<Array<{ name: string; type: "file" | "dir"; path: string }>> {
  if (currentDepth >= maxDepth) return [];

  const entries = await readdir(absPath, { withFileTypes: true });
  const result: Array<{ name: string; type: "file" | "dir"; path: string }> = [];

  for (const entry of entries) {
    if (["node_modules", ".git", ".crayon", "dist"].includes(entry.name)) continue;

    const fullPath = path.join(absPath, entry.name);
    const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, "/");

    result.push({
      name: entry.name,
      type: entry.isDirectory() ? "dir" : "file",
      path: relPath,
    });

    if (entry.isDirectory() && currentDepth + 1 < maxDepth) {
      const children = await listDirRecursive(fullPath, workspaceRoot, maxDepth, currentDepth + 1);
      result.push(...children);
    }
  }

  return result;
}

function runCommand(command: string, cwd: string, timeoutMs: number): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const shell = isWin ? "powershell.exe" : "/bin/sh";
    const shellFlag = isWin ? "-Command" : "-c";

    const proc = spawn(shell, [shellFlag, command], {
      cwd,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, stdout, stderr: stderr + "\n[timeout]", exitCode: -1 });
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, stdout: stdout.slice(0, 20000), stderr: stderr.slice(0, 5000), exitCode: code ?? -1 });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, stdout, stderr: err.message, exitCode: -1 });
    });
  });
}

export type ToolSet = ReturnType<typeof createTools>;
