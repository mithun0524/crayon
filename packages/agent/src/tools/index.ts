import { readFile, writeFile, mkdir, readdir, unlink, rename, stat } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
import { lookup } from "node:dns/promises";
import { createTwoFilesPatch } from "diff";
import { simpleGit } from "simple-git";
import { z } from "zod";
import { parse as shellParse } from "shell-quote";
import { Project, Node, SyntaxKind } from "ts-morph";
import type { ToolContext } from "../types.js";
import { createGitTools } from "./git-workflow.js";
import { createAskUserTool } from "./ask_user.js";
import { createGlobTool } from "./glob.js";
import { createReplTool } from "./repl.js";
import { createAgentTool } from "./agent.js";
import { createTodoTool } from "./todo.js";

const DANGEROUS_PATTERNS = [
  /rm\s+(?:-\w+\s+)*(?:-r\s+-f|-f\s+-r|-rf|-fr)/i,
  /rmdir\s+\/s/i,
  /del\s+\/f/i,
  /format\s+/i,
  /shutdown/i,
  /mkfs/i,
  /:\(\)\s*\{\s*:\|:&\s*\}/,
  />\s*\/dev\/sd/,
  // Shell chaining / redirection / command substitution — a single blocklist
  // can never cover what these compose, so any of them requires approval.
  /[;`]|\$\(|\$\{|\|\||&&|&(?!\d)|>>?|<|\|/,
  // Inline env assignment (e.g. `X=curl $X ...`) hides the real command.
  /(^|\s)[A-Za-z_][A-Za-z0-9_]*=/,
];

// Binaries that can execute code, exfiltrate, or destroy — flagged so `auto`
// mode still asks. Not exhaustive (impossible for a denylist), but closes the
// obvious gaps beyond the token list below.
const DANGEROUS_BINARIES = new Set([
  "cd", "rm", "del", "mv", "cp", "sh", "bash", "zsh", "dash", "ksh", "fish",
  "cmd", "powershell", "pwsh", "node", "deno", "bun", "python", "python3",
  "ruby", "perl", "php", "curl", "wget", "eval", "exec", "env", "dd", "chmod",
  "chown", "ln", "ssh", "scp", "rsync", "nc", "ncat", "socat", "telnet",
  "git", "make", "kill", "killall", "find", "xargs", "tar", "truncate",
  "launchctl", "systemctl", "crontab", "at",
]);

function capResult(result: string, maxChars: number = 50000): string {
  if (result.length <= maxChars) return result;
  return result.slice(0, maxChars) + `\n\n... (output truncated at ${maxChars} chars. Full output is ${result.length} chars.)`;
}

/**
 * Whitespace-tolerant fallback for edit_file: when old_string doesn't match
 * exactly (the #1 failure for weaker models — different indentation or spacing,
 * e.g. model sends "a - b" but the file has "a-b"), match ignoring ALL
 * whitespace and map the normalized offsets back to the original text. Replaces
 * only if the whitespace-stripped needle occurs exactly once. Returns null on 0
 * or >1 matches (ambiguous → refuse rather than edit the wrong place).
 */
function fuzzyReplace(content: string, oldStr: string, newStr: string): string | null {
  // Strip whitespace, keeping a map from each kept char to its original index.
  const strip = (s: string): { out: string; map: number[] } => {
    let out = "";
    const map: number[] = [];
    for (let i = 0; i < s.length; i++) {
      if (!/\s/.test(s[i])) { out += s[i]; map.push(i); }
    }
    return { out, map };
  };
  const c = strip(content);
  const o = strip(oldStr);
  if (o.out.length === 0) return null;

  const first = c.out.indexOf(o.out);
  if (first === -1) return null;
  if (c.out.indexOf(o.out, first + 1) !== -1) return null; // ambiguous

  const origStart = c.map[first];
  const origEnd = c.map[first + o.out.length - 1] + 1; // one past the last matched char
  return content.slice(0, origStart) + newStr + content.slice(origEnd);
}

/** True if an IP is loopback / private / link-local / reserved (SSRF targets). */
function isBlockedIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    return (
      p[0] === 10 ||                                   // 10/8
      p[0] === 127 ||                                  // loopback
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||    // 172.16/12
      (p[0] === 192 && p[1] === 168) ||                // 192.168/16
      (p[0] === 169 && p[1] === 254) ||                // link-local (cloud metadata)
      p[0] === 0 || p[0] >= 224                        // 0.0.0.0/8, multicast/reserved
    );
  }
  const l = ip.toLowerCase().replace(/^\[|\]$/g, "");
  return l === "::1" || l === "::" || l.startsWith("fe80") || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("::ffff:");
}

/** Validate a URL for outbound fetch: http(s) only, resolves to a public IP. Throws otherwise. */
async function assertPublicUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try { u = new URL(rawUrl); } catch { throw new Error(`Invalid URL: ${rawUrl}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Blocked non-http(s) URL scheme: ${u.protocol}`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) {
    throw new Error(`Blocked internal host: ${u.hostname}`);
  }
  let ips: string[];
  if (net.isIP(host)) ips = [host];
  else {
    try { ips = (await lookup(host, { all: true })).map((a) => a.address); }
    catch { throw new Error(`Could not resolve host: ${u.hostname}`); }
  }
  if (ips.some(isBlockedIp)) {
    throw new Error(`Blocked request to private/loopback address (${ips.join(", ")}) — possible SSRF.`);
  }
}

/** Fetch that revalidates the target on every redirect hop (SSRF-safe). */
async function safeFetch(url: string, signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString(); // re-validated at loop top
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

export function createTools(ctx: ToolContext) {
    // Canonicalize the workspace root once. process.cwd() can be a symlink
    // (e.g. macOS /var -> /private/var); without this, an absolute path from
    // the model realpaths to /private/var and fails the containment check.
    const rootReal = (() => { try { return realpathSync(ctx.workspaceRoot); } catch { return ctx.workspaceRoot; } })();

    const resolvePath = (filePath: string) => {
      let resolved = path.resolve(rootReal, filePath);
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

      const relative = path.relative(rootReal, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Path escapes workspace: ${filePath}`);
      }
      // Reject option-like filenames so a path can never be misread as a CLI
      // flag when passed to git/shell tooling (e.g. `-rf`, `--author=…`).
      if (path.basename(resolved).startsWith("-")) {
        throw new Error(`Refusing option-like filename: ${filePath}`);
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
    ...createGitTools(ctx),
    ask_user: createAskUserTool(ctx),
    glob_search: createGlobTool(ctx),
    repl: createReplTool(ctx),
    // Only expose sub-agent delegation when allowed (disabled inside sub-agents to prevent recursion).
    ...(ctx.allowSubagents === false ? {} : { spawn_agent: createAgentTool(ctx) }),
    todo: createTodoTool(ctx),

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

        let newContent: string;
        if (occurrences === 1) {
          newContent = content.replace(old_string, new_string);
        } else if (occurrences > 1) {
          return { success: false, error: notReadWarning + `old_string found ${occurrences} times. Provide more context to make it unique.` };
        } else {
          // Exact match failed — try a whitespace-tolerant line match before giving up.
          const fuzzy = fuzzyReplace(content, old_string, new_string);
          if (fuzzy === null) {
            return { success: false, error: notReadWarning + "old_string not found in file (also tried a whitespace-insensitive match). Read the file and copy the exact text to replace." };
          }
          newContent = fuzzy;
        }

        const approved = await checkEditPermission(filePath, newContent);
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER" };
        }

        const diff = createTwoFilesPatch(filePath, filePath, content, newContent);
        await ctx.transaction?.snapshotFile(filePath);
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

        if (Node.isVariableDeclaration(targetNode)) {
          const stmt = targetNode.getFirstAncestorByKind(SyntaxKind.VariableStatement);
          if (stmt) targetNode = stmt;
        }

        targetNode.replaceWithText(new_content);
        const newContent = sourceFile.getFullText();

        const approved = await checkEditPermission(filePath, newContent);
        if (!approved) {
          return { success: false, error: "PERMISSION_DENIED_BY_USER" };
        }

        const diff = createTwoFilesPatch(filePath, filePath, content, newContent);
        await ctx.transaction?.snapshotFile(filePath);
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
        await ctx.transaction?.snapshotFile(filePath);
        await writeFile(absPath, content, "utf-8");

        const diff = createTwoFilesPatch(filePath, filePath, "", content);
        ctx.onEvent?.({ type: "edit", path: filePath, diff });

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
        await ctx.transaction?.snapshotFile(filePath);
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
    find_usages: {
      description: "Find all usages/references of a specific symbol across the codebase.",
      parameters: z.object({
        symbol: z.string().describe("The exact name of the symbol to find usages for"),
      }),
      execute: async ({ symbol }: { symbol: string }) => {
        const results = await ctx.indexer.search(symbol, 50);
        const usages = results
          .filter(r => r.matchType === "grep" || r.matchType === "symbol" || r.snippet)
          .map(r => ({
            path: r.path,
            line: r.line,
            snippet: r.snippet,
          }));
        
        return {
          symbol,
          usages: JSON.parse(capResult(JSON.stringify(usages))),
        };
      },
    },

    // concurrent: true | readonly: true | permission: none
    get_dependents: {
      description: "Find which files depend on (import) the specified file. Useful for assessing impact of changes.",
      parameters: z.object({
        file_path: z.string().describe("Relative path of the file to check"),
      }),
      execute: async ({ file_path }: { file_path: string }) => {
        try {
          const dependents = ctx.indexer.getGraph().getDependents(file_path);
          return { file_path, dependents };
        } catch (e: any) {
          return { error: e.message };
        }
      },
    },

    // concurrent: true | readonly: true | permission: none
    get_impact_analysis: {
      description: "Analyze the 'blast radius' of changes to a file by checking dependency graphs and identifying downstream dependents recursively.",
      parameters: z.object({
        file_path: z.string().describe("Relative path of the file to analyze"),
        hops: z.number().optional().default(2).describe("Number of dependency hops to trace (default: 2)"),
      }),
      execute: async ({ file_path, hops }: { file_path: string; hops?: number }) => {
        try {
          const impacted = ctx.indexer.getImpactedFiles?.(file_path, hops) || [];
          return { file_path, impacted, hops: hops || 2 };
        } catch (e: any) {
          return { error: e.message };
        }
      },
    },

    // concurrent: true | readonly: true | permission: none
    get_dependencies: {
      description: "Find which files the specified file depends on (imports).",
      parameters: z.object({
        file_path: z.string().describe("Relative path of the file to check"),
      }),
      execute: async ({ file_path }: { file_path: string }) => {
        try {
          const dependencies = ctx.indexer.getGraph().getDependencies(file_path);
          return { file_path, dependencies };
        } catch (e: any) {
          return { error: e.message };
        }
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
      description: "Run a shell command in the workspace directory. Dangerous commands require approval. Set background:true for long-running processes like dev servers (returns immediately with the pid; the process keeps running).",
      parameters: z.object({
        command: z.string().describe("Shell command to execute"),
        timeout_ms: z.number().default(30000).describe("Timeout in milliseconds (max 120000). Ignored when background is true."),
        cwd: z.string().optional().describe("Working directory (relative to workspace root). Defaults to workspace root."),
        background: z.boolean().optional().describe("Run detached and return immediately — use for dev servers / watchers that don't exit. stdout/stderr go to .crayon/logs/."),
      }),
      execute: async ({ command, timeout_ms, cwd: cwdPath, background }: { command: string; timeout_ms?: number; cwd?: string; background?: boolean }) => {
        if (ctx.signal?.aborted) return { success: false, error: "Aborted", command };
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
                const base = lower.split("/").pop() || lower; // handle /usr/bin/python3
                if (DANGEROUS_BINARIES.has(lower) || DANGEROUS_BINARIES.has(base)) {
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
                  
                  const relToken = path.relative(ctx.workspaceRoot, resolvedToken);
                  if (relToken.startsWith("..") || path.isAbsolute(relToken)) {
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

        const workDir = cwdPath ? resolvePath(cwdPath) : ctx.workspaceRoot;

        if (background) {
          const info = await runBackground(command, workDir);
          return { success: true, background: true, pid: info.pid, logFile: info.logFile, message: `Started in background (pid ${info.pid}). Logs: ${info.logFile}` };
        }

        const timeout = Math.min(timeout_ms ?? 30000, 120000);
        const result = await runCommand(command, workDir, timeout, ctx.signal);
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
        const oldContent = await readFile(absPath, "utf-8");
        await ctx.transaction?.snapshotFile(filePath);
        await unlink(absPath);
        
        const diff = createTwoFilesPatch(filePath, filePath, oldContent, "");
        ctx.onEvent?.({ type: "edit", path: filePath, diff });

        return { success: true, path: filePath, deleted: true, message: "File deleted" };
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
          const response = await safeFetch(url, AbortSignal.timeout(10000));
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

/** Spawn a detached long-running process (dev server, watcher). Returns the
 *  pid immediately; stdout/stderr are redirected to a log file so the agent can
 *  read them later. The process outlives this tool call. */
async function runBackground(command: string, cwd: string): Promise<{ pid: number; logFile: string }> {
  const { open } = await import("node:fs/promises");
  const logDir = path.join(cwd, ".crayon", "logs");
  await mkdir(logDir, { recursive: true });
  const logFile = path.join(logDir, `bg-${Date.now()}.log`);
  const fh = await open(logFile, "a");
  const isWin = process.platform === "win32";
  const shell = isWin ? "powershell.exe" : "/bin/sh";
  const shellFlag = isWin ? "-Command" : "-c";
  const child = spawn(shell, [shellFlag, command], {
    cwd,
    env: process.env,
    detached: true,
    stdio: ["ignore", fh.fd, fh.fd],
  });
  child.unref();
  await fh.close();
  return { pid: child.pid ?? -1, logFile: path.relative(cwd, logFile) };
}

function runCommand(command: string, cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const shell = isWin ? "powershell.exe" : "/bin/sh";
    const shellFlag = isWin ? "-Command" : "-c";

    const proc = spawn(shell, [shellFlag, command], {
      cwd,
      env: process.env,
      signal,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => {
      if (stdout.length < 50000) {
        stdout += d.toString();
        if (stdout.length > 50000) stdout = stdout.slice(0, 50000) + "\n...[truncated]";
      }
    });
    proc.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 10000) {
        stderr += d.toString();
        if (stderr.length > 10000) stderr = stderr.slice(0, 10000) + "\n...[truncated]";
      }
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, stdout, stderr: stderr + "\n[timeout]", exitCode: -1 });
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, stdout, stderr, exitCode: code ?? -1 });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, stdout, stderr: err.message, exitCode: -1 });
    });
  });
}

export type ToolSet = ReturnType<typeof createTools>;
