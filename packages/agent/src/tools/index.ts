import { readFile, writeFile, mkdir, readdir, unlink, rename, stat } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createTwoFilesPatch } from "diff";
import { simpleGit } from "simple-git";
import { z } from "zod";
import { parse as shellParse } from "shell-quote";
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

function capResult(result: string, maxChars: number = 50000): string {
  if (result.length <= maxChars) return result;
  return result.slice(0, maxChars) + `\n\n... (output truncated at ${maxChars} chars. Full output is ${result.length} chars.)`;
}

export function createTools(ctx: ToolContext) {
    const resolvePath = (filePath: string) => {
      let resolved = path.resolve(ctx.workspaceRoot, filePath);
      try {
        if (existsSync(resolved)) {
          resolved = realpathSync(resolved);
        } else {
          const parent = path.dirname(resolved);
          if (existsSync(parent)) {
            resolved = path.join(realpathSync(parent), path.basename(resolved));
          }
        }
      } catch (e) {
        // Fallback to unresolved if realpath fails
      }

      if (!resolved.startsWith(ctx.workspaceRoot)) {
        throw new Error(`Path escapes workspace: ${filePath}`);
      }
      return resolved;
    };

    const checkEditPermission = async (filePath: string, newContent: string) => {
      if (ctx.permissionMode === "plan") return false;
      if (ctx.permissionMode === "auto-edit" || ctx.permissionMode === "auto" || ctx.permissionMode === "bypass") return true;
      if (ctx.approveEdit) return await ctx.approveEdit(filePath, newContent);
      return false; // Default safe fallback
    };

    const checkCommandPermission = async (command: string, isDangerous: boolean) => {
      if (ctx.permissionMode === "plan") return false;
      if (ctx.permissionMode === "bypass") return true;
      if (ctx.permissionMode === "auto" && !isDangerous) return true;
      // auto-edit, ask, or dangerous in auto -> needs approval
      if (ctx.approveCommand) return await ctx.approveCommand(command);
      return false;
    };

  return {
    // concurrent: true | readonly: true | permission: none
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

    // concurrent: true | readonly: true | permission: none
    read_file: {
      description: "Read a file from the workspace. Optionally specify start and end line numbers.",
      parameters: z.object({
        path: z.string().describe("Relative path to the file"),
        start_line: z.number().optional().describe("Start line (1-indexed)"),
        end_line: z.number().optional().describe("End line (1-indexed)"),
      }),
      execute: async ({ path: filePath, start_line, end_line }: { path: string; start_line?: number; end_line?: number }) => {
        const absPath = resolvePath(filePath);
        
        if (existsSync(absPath)) {
          const stats = await import("node:fs/promises").then(fs => fs.stat(absPath));
          if (stats.size > 2 * 1024 * 1024) {
            throw new Error(`File ${filePath} is too large (>2MB). Please use grep or search_codebase instead.`);
          }
        }

        const content = await readFile(absPath, "utf-8");
        const lines = content.split("\n");

        // Track that we read this file
        ctx.fileState?.markRead(filePath, content);

        if (start_line !== undefined || end_line !== undefined) {
          const start = (start_line ?? 1) - 1;
          const end = end_line ?? lines.length;
          const slice = lines.slice(start, end);
          return {
            path: filePath,
            content: capResult(slice.map((l, i) => `${start + i + 1}|${l}`).join("\n")),
            totalLines: lines.length,
          };
        }

        return {
          path: filePath,
          content: capResult(lines.map((l, i) => `${i + 1}|${l}`).join("\n")),
          totalLines: lines.length,
        };
      },
    },

    // concurrent: false | readonly: false | permission: ask
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

        const stats = await stat(absPath);
        if (stats.size > 2 * 1024 * 1024) {
          throw new Error("File is too large (>2MB).");
        }

        // Warn if file hasn't been read first
        const notReadWarning = ctx.fileState && !ctx.fileState.hasRead(filePath)
          ? "Warning: You have not read this file yet. Read it first to avoid overwriting changes. "
          : "";

        const content = await readFile(absPath, "utf-8");
        const occurrences = content.split(old_string).length - 1;

        if (occurrences === 0) {
          return { success: false, error: notReadWarning + "old_string not found in file" };
        }
        if (occurrences > 1) {
          return { success: false, error: notReadWarning + `old_string found ${occurrences} times. Provide more context to make it unique.` };
        }

        const newContent = content.replace(old_string, new_string);
        
        const approved = await checkEditPermission(filePath, newContent);
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER" };
        }

        const diff = createTwoFilesPatch(filePath, filePath, content, newContent);
        await writeFile(absPath, newContent, "utf-8");

        ctx.onEvent?.({ type: "edit", path: filePath, diff });

        const result: Record<string, unknown> = { success: true, path: filePath, diff };
        if (notReadWarning) result.warning = notReadWarning.trim();
        return result;
      },
    },

    // concurrent: false | readonly: false | permission: ask
    edit_ast: {
      description: "Replace a TypeScript/JavaScript function, class, or class method using ts-morph AST. For class methods use 'ClassName.methodName' notation. Prefer over edit_file for large structural changes.",
      parameters: z.object({
        path: z.string().describe("Relative path to the file"),
        symbol_name: z.string().describe("Symbol to replace. Use 'ClassName.methodName' for class methods, or just the name for top-level functions/classes/interfaces."),
        new_content: z.string().describe("Complete replacement code for the symbol including its declaration"),
      }),
      execute: async ({ path: filePath, symbol_name, new_content }: { path: string; symbol_name: string; new_content: string }) => {
        const absPath = resolvePath(filePath);
        if (!existsSync(absPath)) {
          return { success: false, error: `File not found: ${filePath}.` };
        }

        const stats = await stat(absPath);
        if (stats.size > 2 * 1024 * 1024) {
          throw new Error("File is too large (>2MB).");
        }

        const project = new Project({ useInMemoryFileSystem: true });
        const content = await readFile(absPath, "utf-8");
        const sourceFile = project.createSourceFile(absPath, content);

        let targetNode: any = null;

        // Support "ClassName.methodName" notation
        const dotIdx = symbol_name.indexOf(".");
        if (dotIdx !== -1) {
          const className = symbol_name.slice(0, dotIdx);
          const methodName = symbol_name.slice(dotIdx + 1);
          for (const cls of sourceFile.getClasses()) {
            if (cls.getName() === className) {
              for (const method of cls.getMethods()) {
                if (method.getName() === methodName) {
                  targetNode = method;
                  break;
                }
              }
              // Also check getters/setters
              if (!targetNode) {
                for (const getter of cls.getGetAccessors()) {
                  if (getter.getName() === methodName) { targetNode = getter; break; }
                }
              }
              if (!targetNode) {
                for (const setter of cls.getSetAccessors()) {
                  if (setter.getName() === methodName) { targetNode = setter; break; }
                }
              }
              break;
            }
          }
          if (!targetNode) {
            return { success: false, error: `Method '${methodName}' not found in class '${className}'. Available classes: ${sourceFile.getClasses().map(c => c.getName()).join(", ")}` };
          }
        } else {
          // Top-level symbol search
          for (const dec of sourceFile.getClasses()) {
            if (dec.getName() === symbol_name) { targetNode = dec; break; }
          }
          if (!targetNode) {
            for (const dec of sourceFile.getFunctions()) {
              if (dec.getName() === symbol_name) { targetNode = dec; break; }
            }
          }
          if (!targetNode) {
            for (const dec of sourceFile.getVariableDeclarations()) {
              if (dec.getName() === symbol_name) { targetNode = dec; break; }
            }
          }
          if (!targetNode) {
            for (const dec of sourceFile.getInterfaces()) {
              if (dec.getName() === symbol_name) { targetNode = dec; break; }
            }
          }
          if (!targetNode) {
            for (const dec of sourceFile.getTypeAliases()) {
              if (dec.getName() === symbol_name) { targetNode = dec; break; }
            }
          }
          if (!targetNode) {
            // Also search class methods by name alone as fallback (may match multiple, takes first)
            for (const cls of sourceFile.getClasses()) {
              for (const method of cls.getMethods()) {
                if (method.getName() === symbol_name) { targetNode = method; break; }
              }
              if (targetNode) break;
            }
          }
          if (!targetNode) {
            const available = [
              ...sourceFile.getClasses().map(c => c.getName() ?? ""),
              ...sourceFile.getFunctions().map(f => f.getName() ?? ""),
              ...sourceFile.getInterfaces().map(i => i.getName()),
            ].filter(Boolean).join(", ");
            return { success: false, error: `Symbol '${symbol_name}' not found. Available top-level symbols: ${available || "none"}. For class methods use 'ClassName.methodName'.` };
          }
        }

        targetNode.replaceWithText(new_content);
        const newContent = sourceFile.getFullText();

        const approved = await checkEditPermission(filePath, newContent);
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER" };
        }

        const diff = createTwoFilesPatch(filePath, filePath, content, newContent);
        await writeFile(absPath, newContent, "utf-8");
        ctx.onEvent?.({ type: "edit", path: filePath, diff });
        return { success: true, path: filePath, diff };
      },
    },

    // concurrent: false | readonly: false | permission: ask
    write_file: {
      description: "Create a new file. Cannot overwrite existing files — use edit_file or overwrite_file instead.",
      parameters: z.object({
        path: z.string().describe("Relative path for the new file"),
        content: z.string().describe("File content"),
      }),
      execute: async ({ path: filePath, content }: { path: string; content: string }) => {
        const absPath = resolvePath(filePath);
        if (existsSync(absPath)) {
          // Warn if file exists but hasn't been read
          const notReadWarning = ctx.fileState && !ctx.fileState.hasRead(filePath)
            ? " Warning: You have not read this file yet. Read it first to avoid overwriting changes."
            : "";
          return { success: false, error: `File already exists: ${filePath}. Use edit_file for targeted edits or overwrite_file to replace the whole file.${notReadWarning}` };
        }

        const approved = await checkEditPermission(filePath, content);
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER" };
        }

        await mkdir(path.dirname(absPath), { recursive: true });
        await writeFile(absPath, content, "utf-8");

        ctx.onEvent?.({ type: "edit", path: filePath, diff: `+ Created new file: ${filePath}` });

        return { success: true, path: filePath, created: true };
      },
    },

    // concurrent: false | readonly: false | permission: ask
    overwrite_file: {
      description: "Replace an ENTIRE existing file with new content. Use when edit_file's search/replace is impractical (e.g. large rewrites, new implementations). File must already exist.",
      parameters: z.object({
        path: z.string().describe("Relative path to the existing file"),
        content: z.string().describe("Complete new file content"),
      }),
      execute: async ({ path: filePath, content }: { path: string; content: string }) => {
        const absPath = resolvePath(filePath);
        if (!existsSync(absPath)) {
          return { success: false, error: `File not found: ${filePath}. Use write_file to create new files.` };
        }

        const stats = await stat(absPath);
        if (stats.size > 2 * 1024 * 1024) {
          throw new Error("File is too large (>2MB).");
        }

        // Warn if file hasn't been read first
        const notReadWarning = ctx.fileState && !ctx.fileState.hasRead(filePath)
          ? "Warning: You have not read this file yet. Read it first to avoid overwriting changes. "
          : "";

        const oldContent = await readFile(absPath, "utf-8");

        const approved = await checkEditPermission(filePath, content);
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER" };
        }

        const diff = createTwoFilesPatch(filePath, filePath, oldContent, content);
        await writeFile(absPath, content, "utf-8");
        ctx.onEvent?.({ type: "edit", path: filePath, diff });
        const result: Record<string, unknown> = { success: true, path: filePath, overwritten: true, diff };
        if (notReadWarning) result.warning = notReadWarning.trim();
        return result;
      },
    },

    // concurrent: true | readonly: true | permission: none
    grep: {
      description: "Search for a pattern in the codebase using ripgrep.",
      parameters: z.object({
        pattern: z.string().describe("Search pattern (regex supported)"),
        glob: z.string().optional().describe("File glob filter, e.g. '*.ts'"),
      }),
      execute: async ({ pattern, glob }: { pattern: string; glob?: string }) => {
        if (glob) {
          // Use ripgrep directly with glob filter
          const rgResult = await new Promise<{ matches: Array<{ path: string; line: number; snippet: string }> }>((resolve) => {
            const args = ["--json", "--max-count", "30", "--glob", glob, pattern, ctx.workspaceRoot];
            const proc = spawn("rg", args, { cwd: ctx.workspaceRoot });
            let output = "";
            proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
            proc.stderr.on("data", () => {});
            proc.on("close", () => {
              const matches: Array<{ path: string; line: number; snippet: string }> = [];
              for (const line of output.split("\n")) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.type === "match") {
                    matches.push({
                      path: path.relative(ctx.workspaceRoot, parsed.data.path.text).replace(/\\/g, "/"),
                      line: parsed.data.line_number,
                      snippet: parsed.data.lines.text?.trim() ?? "",
                    });
                  }
                } catch {}
              }
              resolve({ matches });
            });
            proc.on("error", () => resolve({ matches: [] }));
          });
          return rgResult;
        }
        const results = await ctx.indexer.search(pattern, 30);
        const raw = JSON.stringify(results
          .filter((r) => r.matchType === "grep" || r.snippet)
          .map((r) => ({
            path: r.path,
            line: r.line,
            snippet: r.snippet,
          })));
        return {
          matches: JSON.parse(capResult(raw)),
        };
      },
    },

    // concurrent: true | readonly: true | permission: none
    search_codebase: {
      description: "Hybrid search: symbols + ripgrep + dependency graph. Best for finding relevant code.",
      parameters: z.object({
        query: z.string().describe("Natural language or symbol name to search for"),
      }),
      execute: async ({ query }: { query: string }) => {
        const results = await ctx.indexer.search(query, 20);
        const raw = JSON.stringify(results.map((r) => ({
          path: r.path,
          score: r.score,
          matchType: r.matchType,
          line: r.line,
          symbol: r.symbol,
          snippet: r.snippet,
        })));
        return {
          results: JSON.parse(capResult(raw)),
        };
      },
    },

    // concurrent: true | readonly: true | permission: none
    list_directory: {
      description: "List files and directories in a path.",
      parameters: z.object({
        path: z.string().default(".").describe("Relative directory path"),
        depth: z.number().default(1).describe("Recursion depth"),
      }),
      execute: async ({ path: dirPath, depth }: { path?: string; depth?: number }) => {
        const absPath = resolvePath(dirPath ?? ".");
        const entries = await listDirRecursive(absPath, ctx.workspaceRoot, depth ?? 1);
        const raw = JSON.stringify({ path: dirPath ?? ".", entries });
        return JSON.parse(capResult(raw));
      },
    },

    // concurrent: false | readonly: false | permission: ask
    terminal: {
      description: "Run a shell command in the workspace directory. Dangerous commands require approval.",
      parameters: z.object({
        command: z.string().describe("Shell command to execute"),
        timeout_ms: z.number().default(30000).describe("Timeout in milliseconds (max 120000)"),
        cwd: z.string().optional().describe("Working directory (relative to workspace root). Defaults to workspace root."),
      }),
      execute: async ({ command, timeout_ms, cwd: cwdPath }: { command: string; timeout_ms?: number; cwd?: string }) => {
        let isDangerous = false;
        for (const pattern of DANGEROUS_PATTERNS) {
          if (pattern.test(command)) {
            isDangerous = true;
            break;
          }
        }

        if (!isDangerous) {
          try {
            const parsed = shellParse(command);
            for (const token of parsed) {
              if (typeof token === "string") {
                const lower = token.toLowerCase();
                if (["cd", "rm", "del", "mv", "sh", "bash", "cmd", "powershell", "pwsh", "node", "python", "ruby", "perl"].includes(lower)) {
                  isDangerous = true;
                  break;
                }
                if (path.isAbsolute(token) || token.startsWith("../") || token.startsWith("..\\")) {
                  let resolvedToken = path.isAbsolute(token) ? token : path.join(cwdPath ? resolvePath(cwdPath) : ctx.workspaceRoot, token);
                  try {
                    if (existsSync(resolvedToken)) {
                      resolvedToken = realpathSync(resolvedToken);
                    } else if (existsSync(path.dirname(resolvedToken))) {
                      resolvedToken = path.join(realpathSync(path.dirname(resolvedToken)), path.basename(resolvedToken));
                    }
                  } catch (e) {}
                  
                  if (!resolvedToken.startsWith(ctx.workspaceRoot)) {
                    isDangerous = true;
                    break;
                  }
                }
              } else if (typeof token === "object" && token !== null && "op" in token) {
                // If parse returns operators that are complex, treat it carefully
                const op = (token as any).op;
                if (op === "glob" || op === "!" || op === "command") {
                  // Just keeping note, we could flag complex ops here, but let's stick to tokens for now
                }
              }
            }
          } catch (e) {
            isDangerous = true;
          }
        }

        const approved = await checkCommandPermission(command, isDangerous);
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER", command };
        }

        const timeout = Math.min(timeout_ms ?? 30000, 120000);
        const workDir = cwdPath ? resolvePath(cwdPath) : ctx.workspaceRoot;
        const result = await runCommand(command, workDir, timeout);
        return {
          ...result,
          stdout: capResult(result.stdout),
          stderr: capResult(result.stderr, 10000),
        };
      },
    },

    // concurrent: true | readonly: true | permission: none
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

    // concurrent: true | readonly: true | permission: none
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

    // concurrent: false | readonly: false | permission: ask
    git_commit: {
      description: "Stage all changes and commit with a message.",
      parameters: z.object({
        message: z.string().describe("Commit message"),
      }),
      execute: async ({ message }: { message: string }) => {
        const approved = await checkCommandPermission(`git add . && git commit -m ${JSON.stringify(message)}`, false);
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER", message };
        }

        const git = simpleGit(ctx.workspaceRoot);
        await git.add(".");
        const result = await git.commit(message);
        return { success: true, hash: result.commit, summary: result.summary };
      },
    },

    // concurrent: false | readonly: false | permission: ask
    delete_file: {
      description: "Delete a file from the workspace.",
      parameters: z.object({
        path: z.string().describe("Relative path to the file to delete"),
      }),
      execute: async ({ path: filePath }: { path: string }) => {
        const absPath = resolvePath(filePath);
        if (!existsSync(absPath)) {
          return { success: false, error: `File not found: ${filePath}` };
        }

        const approved = await checkEditPermission(filePath, "");
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER" };
        }

        await unlink(absPath);
        ctx.onEvent?.({ type: "edit", path: filePath, diff: `- Deleted file: ${filePath}` });
        return { path: filePath, success: true, message: "File deleted" };
      },
    },

    // concurrent: false | readonly: false | permission: ask
    rename_file: {
      description: "Rename or move a file within the workspace.",
      parameters: z.object({
        old_path: z.string().describe("Current relative path of the file"),
        new_path: z.string().describe("New relative path for the file"),
      }),
      execute: async ({ old_path, new_path }: { old_path: string; new_path: string }) => {
        const absOld = resolvePath(old_path);
        const absNew = resolvePath(new_path);

        if (!existsSync(absOld)) {
          return { success: false, error: `File not found: ${old_path}` };
        }
        if (existsSync(absNew)) {
          return { success: false, error: `Destination already exists: ${new_path}` };
        }

        const approved = await checkEditPermission(old_path, "");
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER" };
        }

        await mkdir(path.dirname(absNew), { recursive: true });
        await rename(absOld, absNew);
        ctx.onEvent?.({ type: "edit", path: old_path, diff: `Renamed: ${old_path} -> ${new_path}` });
        return { old_path, new_path, success: true };
      },
    },

    // concurrent: true | readonly: true | permission: ask
    web_fetch: {
      description: "Fetch content from a URL. Returns the response text. Requires permission.",
      parameters: z.object({
        url: z.string().describe("URL to fetch"),
        max_length: z.number().optional().describe("Max response length in chars (default 50000)"),
      }),
      execute: async ({ url, max_length }: { url: string; max_length?: number }) => {
        const approved = await checkCommandPermission(`web_fetch: ${url}`, false);
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER", url };
        }

        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(10000),
          });
          const body = await response.text();
          const maxLen = max_length ?? 50000;
          return {
            url,
            status: response.status,
            content_type: response.headers.get("content-type") ?? "unknown",
            body: capResult(body, maxLen),
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { success: false, error: `Fetch failed: ${message}`, url };
        }
      },
    },

    // concurrent: true | readonly: true | permission: none
    ask_user: {
      description: "Ask the user a question. Use when you need clarification or a decision.",
      parameters: z.object({
        question: z.string().describe("The question to ask the user"),
      }),
      execute: async ({ question }: { question: string }) => {
        ctx.onEvent?.({ type: "ask_user", question });
        return { answer: "User interaction not supported in current mode" };
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
