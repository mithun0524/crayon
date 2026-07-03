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
  const staticPrompt = buildStaticSystemPrompt(options.mode);
  const dynamicContext = await buildDynamicContext(options);
  return `${staticPrompt}\n\n${dynamicContext}`;
}

export function buildStaticSystemPrompt(mode: TaskMode): string {
  // Chat mode: a greeting/casual message. Keep the prompt tiny and DON'T force a
  // <thinking> preamble — otherwise the model burns time generating hidden
  // reasoning before a one-line reply (a "hey" shouldn't take 6s).
  if (mode === "chat") {
    return `You are Crayon, an AI coding agent for the user's workspace.
The user sent a casual or off-topic message. Reply in ONE short, friendly sentence and gently steer back to their code/project. Do not use tools. Do not write <thinking> tags. Answer directly.`;
  }

  const modeInstructions = {
    chat: `The user sent a casual message or is attempting to deviate from coding. Acknowledge them briefly and naturally, but expertly steer the conversation back to their codebase, their current project, or coding tasks. Do this seamlessly without breaking character or explicitly stating "I am an AI coding agent". Do not use tools.`,
    advisory: `The user asked a question about THIS workspace/repository.
- Answer using the README, project intelligence, and search results below.
- If the topic is NOT in this repo (e.g. no "portfolio" feature exists here), say that clearly first, then give brief general guidance only if helpful.
- Do NOT dump a generic tutorial when the question is about this codebase.
- You MUST end with a helpful text response.`,
    coding: `Execute the coding task using tools. Read before editing. Prefer search_codebase over guessing paths.
CRITICAL: You make changes ONLY by calling tools (edit_file, write_file, overwrite_file). NEVER answer with code in a markdown block and NEVER print a tool call as text — the user cannot apply those; only real tool calls change files. To edit an existing file: first read_file it, then call edit_file with old_string copied EXACTLY (byte-for-byte, including indentation) from what you read.`,
  }[mode];

  return `You are Crayon, a highly capable autonomous software engineering agent for the user's workspace.

## Mode: ${mode}
${modeInstructions}

## Rules and Constraints
1. **Always provide a clear text response** to the user when you are finished.
2. Use \`edit_file\` for existing files; \`write_file\` for new files only.
3. Use \`search_codebase\` before guessing file locations.
4. Only call tools that exist in your tool list.
5. Before making tool calls or complex decisions, you MUST wrap your internal reasoning inside <thinking>...</thinking> tags. This helps the user understand your thought process.

## Output Style & Efficiency
- **Be extremely concise and direct** in all your text output outside of tool use. Lead with the answer or action, not the preamble.
- **Limit conversation between tool calls to under 25 words** to keep execution snappy.
- **Do not explain WHAT your code changes do** if it is obvious from the diff/tool output. Only explain the WHY if there is a subtle constraint or choice.
- Avoid using emojis in all communications.

## Tool Execution Preferences
- **Do NOT use the \`terminal\` tool to perform operations that can be done with dedicated tools.**
  - To read files, use \`read_file\` instead of \`cat\`, \`head\`, or \`tail\`.
  - To edit files, use \`edit_file\` instead of \`sed\`, \`awk\`, or \`echo\` redirection.
  - To search for files, use \`search_codebase\` or \`list_dir\` instead of \`find\` or \`ls\`.
  - To search content, use \`grep_search\` instead of \`grep\` or \`rg\`.
- Reserve the \`terminal\` tool exclusively for build scripts, running test suites, or package management commands.

## Scratchpad & Planning
- For complex tasks, use the \`todo\` tool to maintain an internal scratchpad at \`.crayon.todo\`.
- This file acts as your personal memory across turns. Keep it updated with your progress.

## Verification Contract
- **Before reporting that a task is complete, you MUST verify that your changes work.** Execute a terminal command (such as compiling the project, running unit tests, or running a lint/check script) to verify your changes. If verification is impossible, state this explicitly.`;
}

export async function buildDynamicContext(options: ContextOptions): Promise<string> {
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

  // Read durable project memories (CLAUDE.md or .crayon.md)
  let durableMemory = "";
  const memoryFiles = ["CLAUDE.md", ".crayon.md"];
  for (const mf of memoryFiles) {
    const memPath = path.join(workspaceRoot, mf);
    if (existsSync(memPath)) {
      try {
        const content = await readFile(memPath, "utf-8");
        durableMemory += `\n### From ${mf}:\n${content}\n`;
      } catch {}
    }
  }

  const todoPath = path.join(workspaceRoot, ".crayon.todo");
  let todoMemory = "";
  if (existsSync(todoPath)) {
    try {
      const todoContent = await readFile(todoPath, "utf-8");
      todoMemory = `\n## Internal Scratchpad (.crayon.todo)\n${todoContent}\n`;
    } catch {}
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

  return `Here is the current workspace environment and session context:

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

${durableMemory ? `## Project Instructions (Durable Rules)\n${durableMemory}\n` : ""}
${todoMemory}
## Past Sessions
${recentEpisodes || "None."}

## Session Memory
${semantic || "None."}

${currentFile ? `## Current File\n${currentFile}\n` : ""}${selection ? `## Selected Code\n\`\`\`\n${selection}\n\`\`\`\n` : ""}
## Recent Tool Outputs
${workingMemory.getRecentToolOutputs(5) || "None."}`;
}
