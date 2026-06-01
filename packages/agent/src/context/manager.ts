import type { CodeIndexer, RepoIntelligence } from "crayon-indexer";
import type { TaskMode } from "../planner/plan.js";
import type { WorkingMemory } from "../memory/working.js";
import type { EpisodicMemory } from "../memory/episodic.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export interface ContextOptions {
  task: string;
  plan: string[];
  mode: TaskMode;
  workspaceRoot: string;
  indexer: CodeIndexer;
  workingMemory: WorkingMemory;
  episodicMemory: EpisodicMemory;
  intelligence?: RepoIntelligence | null;
  currentFile?: string;
  selection?: string;
}

export async function buildSystemPrompt(options: ContextOptions): Promise<string> {
  const {
    task,
    plan,
    mode,
    workspaceRoot,
    indexer,
    workingMemory,
    episodicMemory,
    intelligence,
    currentFile,
    selection,
  } = options;

  const searchResults = mode === "chat" ? [] : await indexer.search(task, 15);
  const fileContext = searchResults
    .slice(0, 10)
    .map((r) => {
      const sym = r.symbol ? ` (symbol: ${r.symbol})` : "";
      const snippet = r.snippet ? `: ${r.snippet.slice(0, 100)}` : "";
      return `- ${r.path}:${r.line ?? "?"}${sym}${snippet}`;
    })
    .join("\n");

  let readmeExcerpt = "";
  if (mode === "advisory") {
    const readmePath = path.join(workspaceRoot, "README.md");
    if (existsSync(readmePath)) {
      try {
        const readme = await readFile(readmePath, "utf-8");
        readmeExcerpt = readme.slice(0, 1500);
      } catch {
        // ignore
      }
    }
  }

  const recentEpisodes = episodicMemory
    .getRecent(3)
    .map((e) => `- [${e.success ? "OK" : "FAIL"}] ${e.task}: ${e.outcome.slice(0, 100)}`)
    .join("\n");

  const semantic = episodicMemory.getSemanticSummary();

  const intelStr = intelligence
    ? `Framework: ${intelligence.framework ?? "unknown"}
Language: ${intelligence.language ?? "unknown"}
Package manager: ${intelligence.packageManager ?? "unknown"}
Test runner: ${intelligence.testRunner ?? "unknown"}`
    : "Run crayon init if project metadata is missing.";

  const modeInstructions = {
    chat: `The user sent a casual message or is attempting to deviate from coding. Acknowledge them briefly and naturally, but expertly steer the conversation back to their codebase, their current project, or coding tasks. Do this seamlessly without breaking character or explicitly stating "I am an AI coding agent". Do not use tools.`,
    advisory: `The user asked a question about THIS workspace/repository.
- Answer using the README, project intelligence, and search results below.
- If the topic is NOT in this repo (e.g. no "portfolio" feature exists here), say that clearly first, then give brief general guidance only if helpful.
- Do NOT dump a generic tutorial when the question is about this codebase.
- You MUST end with a helpful text response.`,
    coding: `Execute the coding task using tools. Read before editing. Prefer search_codebase over guessing paths.`,
  }[mode];

  return `You are Crayon, an autonomous software engineering agent for the workspace below.

## Mode: ${mode}
${modeInstructions}

## Workspace
Root: ${workspaceRoot}

## Project Intelligence
${intelStr}

## Current Task
${task}

${plan.length > 0 ? `## Execution Plan\n${plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n` : ""}
## Relevant Files
${fileContext || "No direct code matches for this query."}

${readmeExcerpt ? `## README (excerpt)\n${readmeExcerpt}\n` : ""}

## Past Sessions
${recentEpisodes || "None."}

## Project Memory
${semantic || "None."}

${currentFile ? `## Current File\n${currentFile}\n` : ""}${selection ? `## Selected Code\n\`\`\`\n${selection}\n\`\`\`\n` : ""}
## Recent Tool Outputs
${workingMemory.getRecentToolOutputs(5) || "None."}

## Rules
1. Always provide a clear text response to the user when finished.
2. Use edit_file for existing files; write_file for new files only.
3. Use search_codebase before guessing file locations.
4. Only call tools that exist in your tool list.
5. Before making tool calls or complex decisions, you MUST wrap your internal reasoning inside <thinking>...</thinking> tags. This helps the user understand your thought process.`;
}
