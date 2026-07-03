// Pure constants and presentation helpers extracted from App.tsx to keep the
// main component focused on state and rendering. No React or side effects here.

export const AVAILABLE_COMMANDS = [
  { cmd: "/clear", desc: "Clear conversation history" },
  { cmd: "/undo", desc: "Rewind conversation by 1 turn" },
  { cmd: "/diff", desc: "Show git diff of changes" },
  { cmd: "/status", desc: "Show git status of workspace" },
  { cmd: "/mode", desc: "Change permission mode", usage: "ask | auto-edit | plan | auto | bypass" },
  { cmd: "/cost", desc: "View token usage and cost" },
  { cmd: "/files", desc: "View modified files this session" },
  { cmd: "/compact", desc: "Compact conversation history" },
  { cmd: "/model", desc: "Change the AI model", usage: "[model-name]" },
  { cmd: "/config", desc: "Change provider, model, or theme" },
  { cmd: "/color", desc: "Change the accent color", usage: "[name]" },
  { cmd: "/easel", desc: "View the active agent context (files read)" },
  { cmd: "/exit", desc: "Exit Crayon" },
  { cmd: "/help", desc: "Show help information" }
];

export function buildAsciiTree(paths: string[]): string {
  if (paths.length === 0) return "  (Empty Context)";

  const tree: any = {};
  paths.forEach(p => {
    const parts = p.split(/[/\\]/).filter(Boolean);
    let curr = tree;
    parts.forEach(part => {
      if (!curr[part]) curr[part] = {};
      curr = curr[part];
    });
  });

  const lines: string[] = [];
  function traverse(node: any, prefix: string) {
    const keys = Object.keys(node).sort();
    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const marker = isLast ? "└─ " : "├─ ";
      lines.push(`${prefix}${marker}${key}`);
      const nextPrefix = prefix + (isLast ? "   " : "│  ");
      traverse(node[key], nextPrefix);
    });
  }

  traverse(tree, "");
  return lines.join("\n");
}

export const POPULAR_MODELS = {
  anthropic: [
    { label: "Claude 4.6 Sonnet (Latest)", value: "claude-sonnet-4-6" },
    { label: "Claude 4.8 Opus", value: "claude-opus-4-8" },
    { label: "Claude 4.5 Haiku", value: "claude-haiku-4-5-20251001" },
    { label: "Claude 3.7 Sonnet", value: "claude-3-7-sonnet-latest" }
  ],
  openai: [
    { label: "GPT-4.5", value: "gpt-4.5" },
    { label: "GPT-4o (Latest)", value: "gpt-4o" },
    { label: "o3 Mini", value: "o3-mini" },
    { label: "o1", value: "o1" }
  ],
  google: [
    { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
    { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" }
  ],
  openrouter: [
    { label: "Anthropic: Claude 4.6 Sonnet", value: "anthropic/claude-sonnet-4-6" },
    { label: "OpenAI: GPT-4.5", value: "openai/gpt-4.5" },
    { label: "OpenAI: o3 Mini", value: "openai/o3-mini" },
    { label: "Google: Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
    { label: "DeepSeek: R1", value: "deepseek/deepseek-r1" },
    { label: "Meta: Llama 3.3 70B", value: "meta-llama/llama-3.3-70b-instruct" }
  ],
  ollama: [
    { label: "Qwen 2.5 Coder (7B)", value: "qwen2.5-coder:7b" },
    { label: "Llama 3 (8B)", value: "llama3:latest" },
    { label: "Qwen 2.5 Coder (14B)", value: "qwen2.5-coder:14b" },
    { label: "Llama 3.3 (70B)", value: "llama3.3:latest" }
  ]
};

export const getToolCallInitialText = (name: string, args: any) => {
  switch (name) {
    case "read_file":
      return `⏳ Reading ${args?.path || ""}`;
    case "edit_file":
    case "edit_ast":
      return `⏳ Editing ${args?.path || ""}`;
    case "write_file":
      return `⏳ Creating ${args?.path || ""}`;
    case "overwrite_file":
      return `⏳ Overwriting ${args?.path || ""}`;
    case "grep":
      return `⏳ Searching for "${args?.pattern || ""}"`;
    case "search_codebase":
      return `⏳ Searching codebase for "${args?.query || ""}"`;
    case "terminal":
      return `⏳ Running command: ${args?.command || ""}`;
    case "list_directory":
      return `⏳ Listing directory: ${args?.path || "."}`;
    case "fetch_url":
      return `⏳ Fetching URL: ${args?.url || ""}`;
    case "delete_file":
      return `⏳ Deleting ${args?.path || ""}`;
    case "rename_file":
      return `⏳ Renaming ${args?.old_path || ""} -> ${args?.new_path || ""}`;
    case "git_status":
      return `⏳ Getting Git status`;
    case "git_diff":
      return `⏳ Getting Git diff`;
    case "git_commit":
      return `⏳ Committing changes`;
    default:
      return `⏳ Running tool ${name}`;
  }
};

export const getToolCallCompletedText = (name: string, args: any, result: any, isError: boolean) => {
  const icon = isError ? "✗" : "✓";
  if (isError) {
    const errMsg = result?.error || "Error";
    return `${icon} Failed tool ${name}: ${errMsg}`;
  }

  switch (name) {
    case "read_file": {
      const lineCount = result?.content ? result.content.split("\n").length : 0;
      const byteCount = result?.content ? Buffer.byteLength(result.content, "utf-8") : 0;
      return `${icon} Read ${args?.path || ""} (${lineCount} lines, ${byteCount} bytes)`;
    }
    case "edit_file":
    case "edit_ast":
      return `${icon} Edited ${args?.path || ""}`;
    case "write_file":
      return `${icon} Created ${args?.path || ""}`;
    case "overwrite_file":
      return `${icon} Overwrote ${args?.path || ""}`;
    case "grep": {
      const matchesCount = result?.results?.length ?? result?.matches?.length ?? 0;
      return `${icon} Searched for "${args?.pattern || ""}" (${matchesCount} matches)`;
    }
    case "search_codebase": {
      const matchesCount = result?.results?.length ?? result?.matches?.length ?? 0;
      return `${icon} Searched codebase for "${args?.query || ""}" (${matchesCount} matches)`;
    }
    case "terminal":
      return `${icon} Ran command: ${args?.command || ""}`;
    case "list_directory": {
      const entryCount = result?.entries?.length || 0;
      return `${icon} Listed directory: ${args?.path || "."} (${entryCount} entries)`;
    }
    case "fetch_url": {
      const byteCount = result?.content ? Buffer.byteLength(result.content, "utf-8") : 0;
      return `${icon} Fetched URL: ${args?.url || ""} (${byteCount} bytes)`;
    }
    case "delete_file":
      return `${icon} Deleted ${args?.path || ""}`;
    case "rename_file":
      return `${icon} Renamed ${args?.old_path || ""} -> ${args?.new_path || ""}`;
    case "git_status":
      return `${icon} Got Git status (branch: ${result?.branch || "unknown"})`;
    case "git_diff":
      return `${icon} Got Git diff`;
    case "git_commit":
      return `${icon} Committed with message: ${args?.message || ""}`;
    default:
      return `${icon} Ran tool ${name}`;
  }
};
