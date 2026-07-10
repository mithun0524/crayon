import { z } from "zod";
import path from "node:path";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import type { ToolContext } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return top-N files ranked by symbol count (most-used = most important). */
function topFilesBySymbols(
  files: Map<string, { path: string; symbols: Array<{ name: string; kind: string }> }>,
  n = 12
): Array<{ path: string; symbolCount: number }> {
  return [...files.entries()]
    .map(([, f]) => ({ path: f.path, symbolCount: f.symbols.length }))
    .sort((a, b) => b.symbolCount - a.symbolCount)
    .slice(0, n);
}

/** Best-effort: read recent git log to infer commit convention. */
function detectCommitConvention(workspaceRoot: string): string {
  try {
    const log = execSync("git log --oneline -20", {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
      timeout: 5000,
    });
    const lines = log.trim().split("\n");
    const conventionalCount = lines.filter((l) =>
      /^[a-f0-9]+ (feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)(\(.*?\))?:/.test(l)
    ).length;
    if (conventionalCount >= lines.length * 0.5) {
      return "Conventional Commits (`feat(scope): description`)";
    }
    return "No strict convention detected — match existing style in git log";
  } catch {
    return "No git history available";
  }
}

/** Detect build / test / run scripts from package.json. */
async function detectScripts(
  workspaceRoot: string
): Promise<{ build?: string; test?: string; dev?: string; lint?: string }> {
  const pkgPath = path.join(workspaceRoot, "package.json");
  if (!existsSync(pkgPath)) return {};
  // Use the project's actual package manager, not a hardcoded "pnpm" — the
  // generated commands are baked into durable memory and read every session.
  const pm = existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))
    ? "pnpm"
    : existsSync(path.join(workspaceRoot, "yarn.lock"))
      ? "yarn"
      : existsSync(path.join(workspaceRoot, "bun.lockb"))
        ? "bun"
        : "npm";
  const cmd = (script: string) => (pm === "npm" ? `npm run ${script}` : `${pm} ${script}`);
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    const s = pkg.scripts ?? {};
    return {
      build: s.build ? cmd("build") : undefined,
      test: s.test ? cmd("test") : undefined,
      dev: s.dev ? cmd("dev") : undefined,
      lint: s.lint ? cmd("lint") : undefined,
    };
  } catch {
    return {};
  }
}

/** Detect monorepo workspace packages. */
async function detectWorkspacePackages(workspaceRoot: string): Promise<string[]> {
  // pnpm workspace
  const pnpmWs = path.join(workspaceRoot, "pnpm-workspace.yaml");
  if (existsSync(pnpmWs)) {
    try {
      const content = await readFile(pnpmWs, "utf-8");
      const matches = [...content.matchAll(/- ['"]?(.*?)['"]?$/gm)].map((m) =>
        m[1].replace(/\/\*\*?$/, "")
      );
      return matches.filter(Boolean);
    } catch {}
  }
  // npm/yarn workspaces in package.json
  try {
    const pkg = JSON.parse(await readFile(path.join(workspaceRoot, "package.json"), "utf-8")) as {
      workspaces?: string[] | { packages?: string[] };
    };
    const ws = pkg.workspaces;
    if (Array.isArray(ws)) return ws.map((p) => p.replace(/\/\*\*?$/, ""));
    if (ws?.packages) return ws.packages.map((p) => p.replace(/\/\*\*?$/, ""));
  } catch {}
  return [];
}

/** Read first N chars of README for a project summary. */
async function readReadmeExcerpt(workspaceRoot: string, chars = 600): Promise<string> {
  for (const name of ["README.md", "readme.md", "README.txt"]) {
    const p = path.join(workspaceRoot, name);
    if (existsSync(p)) {
      try {
        const content = await readFile(p, "utf-8");
        // Strip markdown badges/images from the very start (they add noise).
        const stripped = content.replace(/^\[!\[.*?\]\(.*?\)\]\(.*?\)\s*/gm, "").trim();
        return stripped.slice(0, chars);
      } catch {}
    }
  }
  return "";
}

/**
 * If the existing AGENTS.md has a `## Custom Rules` section, preserve it so
 * the developer's manual annotations survive a refresh.
 */
async function extractCustomRules(agentsPath: string): Promise<string> {
  if (!existsSync(agentsPath)) return "";
  try {
    const content = await readFile(agentsPath, "utf-8");
    const match = content.match(/## Custom Rules\b[\s\S]*/);
    return match ? match[0].trim() : "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

async function generateMemoryContent(ctx: ToolContext): Promise<string> {
  const { workspaceRoot, indexer } = ctx;

  // Collect all facts in parallel where possible.
  const [intel, scripts, workspacePackages, readmeExcerpt] = await Promise.all([
    indexer.getIntelligence(),
    detectScripts(workspaceRoot),
    detectWorkspacePackages(workspaceRoot),
    readReadmeExcerpt(workspaceRoot),
  ]);

  const commitConvention = detectCommitConvention(workspaceRoot);

  // Snapshot of the file index for hub-file detection.
  const allFiles = indexer.getAllFiles();
  const keyFiles = topFilesBySymbols(allFiles);

  // ---------------------------------------------------------------------------
  // Build the document
  // ---------------------------------------------------------------------------
  const lines: string[] = [];

  lines.push(`# Project Memory`);
  lines.push(`> Auto-generated by Crayon on ${new Date().toUTCString()}. Edit the **Custom Rules** section below — it will be preserved on refresh.`);
  lines.push("");

  // --- Summary from README ---
  if (readmeExcerpt) {
    lines.push("## Project Summary");
    lines.push(readmeExcerpt.split("\n").slice(0, 6).join("\n").trim());
    lines.push("");
  }

  // --- Architecture ---
  if (workspacePackages.length > 0) {
    lines.push("## Architecture");
    lines.push(`Monorepo. Workspace roots: ${workspacePackages.join(", ")}`);
    lines.push("");
  }

  // --- Tech Stack ---
  lines.push("## Tech Stack");
  const stackLines: string[] = [];
  if (intel?.language) stackLines.push(`- Language: **${intel.language}**`);
  if (intel?.framework) stackLines.push(`- Framework: **${intel.framework}**`);
  if (intel?.packageManager) stackLines.push(`- Package manager: **${intel.packageManager}**`);
  if (intel?.testRunner) stackLines.push(`- Test runner: **${intel.testRunner}**`);
  if (stackLines.length === 0) stackLines.push("- (Could not detect — add details manually)");
  lines.push(...stackLines);
  lines.push("");

  // --- Common Commands ---
  const hasCmds = Object.values(scripts).some(Boolean);
  if (hasCmds) {
    lines.push("## Common Commands");
    if (scripts.build) lines.push(`- Build:   \`${scripts.build}\``);
    if (scripts.test) lines.push(`- Test:    \`${scripts.test}\``);
    if (scripts.dev) lines.push(`- Dev:     \`${scripts.dev}\``);
    if (scripts.lint) lines.push(`- Lint:    \`${scripts.lint}\``);
    lines.push("");
  }

  // --- Key Files ---
  if (keyFiles.length > 0) {
    lines.push("## Key Files");
    lines.push("Files with the highest symbol density — likely entry points or hubs:");
    for (const f of keyFiles) {
      lines.push(`- \`${f.path}\` (${f.symbolCount} symbols)`);
    }
    lines.push("");
  }

  // --- Conventions ---
  lines.push("## Conventions");
  lines.push(`- Commit style: ${commitConvention}`);
  lines.push("- Use `edit_file` (not `overwrite_file`) for existing files");
  lines.push("- Always run build + tests to verify changes before reporting done");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool export
// ---------------------------------------------------------------------------

export function createMemoryTool(ctx: ToolContext) {
  return {
    // concurrent: false | readonly: false | permission: none
    generate_project_memory: {
      description:
        "Scan the workspace and generate (or refresh) a structured AGENTS.md file at the workspace root. " +
        "The file captures architecture, tech stack, key hub files, common commands, and commit conventions. " +
        "All future Crayon sessions will automatically read this file for instant context. " +
        "Any `## Custom Rules` section written by the developer is preserved across refreshes. " +
        "Run this once after first checkout, and again when the project structure changes significantly.",
      parameters: z.object({
        output_path: z
          .string()
          .optional()
          .describe(
            "Where to write the memory file (default: AGENTS.md at workspace root). " +
              "Use a relative path within the workspace."
          ),
      }),
      execute: async ({ output_path }: { output_path?: string }) => {
        try {
          const relPath = output_path ?? "AGENTS.md";

          // Contain the target inside the workspace — output_path is
          // model-supplied, so an absolute path or `..` must not escape and
          // clobber files elsewhere on disk. Mirrors the file tools' guard.
          const rootReal = (() => { try { return realpathSync(ctx.workspaceRoot); } catch { return path.resolve(ctx.workspaceRoot); } })();
          const absPath = path.resolve(rootReal, relPath);
          const rel = path.relative(rootReal, absPath);
          if (rel.startsWith("..") || path.isAbsolute(rel)) {
            return { success: false, error: `output_path escapes the workspace: ${relPath}` };
          }

          // Overwriting a file we didn't generate destroys hand-authored
          // content (only ## Custom Rules is preserved). Require approval to
          // replace a non-Crayon file — unless in an auto/bypass mode.
          if (existsSync(absPath)) {
            let existing = "";
            try { existing = await readFile(absPath, "utf-8"); } catch { /* unreadable */ }
            const crayonGenerated = existing.includes("Auto-generated by Crayon");
            const autoOk = ctx.permissionMode === "auto" || ctx.permissionMode === "bypass" || ctx.permissionMode === "auto-edit";
            if (existing.trim() && !crayonGenerated && !autoOk) {
              const approved = await ctx.approveEdit?.(rel, "(regenerated project memory — replaces existing file)");
              if (!approved) {
                return { success: false, error: `${rel} already exists and was not written by Crayon. Refusing to overwrite without approval (only its "## Custom Rules" section would survive).` };
              }
            }
          }

          // Preserve custom rules if the file already exists.
          const customRules = await extractCustomRules(absPath);

          let content = await generateMemoryContent(ctx);

          // Append preserved custom rules (or a placeholder section).
          if (customRules) {
            content += `\n${customRules}\n`;
          } else {
            content +=
              "## Custom Rules\n" +
              "> Add your own project-specific instructions here. This section is preserved on every `/memory` refresh.\n";
          }

          // Ensure parent directory exists (handles nested paths like docs/MEMORY.md).
          await mkdir(path.dirname(absPath), { recursive: true });
          await writeFile(absPath, content, "utf-8");

          // File size for feedback.
          const bytes = (await stat(absPath)).size;

          return {
            success: true,
            path: relPath,
            bytes,
            message:
              `Project memory written to ${relPath} (${bytes} bytes). ` +
              `All future Crayon sessions will load this automatically.`,
            preview: content.slice(0, 800),
          };
        } catch (err: any) {
          return { success: false, error: err?.message ?? String(err) };
        }
      },
    },
  };
}
