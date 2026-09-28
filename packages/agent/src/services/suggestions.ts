import { execFileSync } from "node:child_process";

// A file-looking token: "README.md", "src/cart.js", "tsconfig.json".
const FILE_TOKEN = /(?:[\w.-]+\/)*[\w-]+\.[a-z][a-z0-9]{0,5}\b/gi;

/** Tracked + untracked-not-ignored files, relative to root. Empty outside git. */
export function listWorkspaceFiles(root: string, cap = 5000): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000, maxBuffer: 8 * 1024 * 1024,
    });
    return out.split("\n").filter(Boolean).slice(0, cap);
  } catch {
    return [];
  }
}

/**
 * Drop follow-ups that name a file the repo doesn't have ("Read README.md" in a
 * repo with no README). With no file list to check against, keep everything.
 */
export function groundSuggestions(suggestions: string[], files: string[]): string[] {
  if (files.length === 0) return suggestions;
  const lower = files.map((f) => f.toLowerCase());
  const exists = (token: string) => {
    const t = token.toLowerCase();
    return lower.some((f) => f === t || f.endsWith("/" + t));
  };
  return suggestions.filter((s) => (s.match(FILE_TOKEN) ?? []).every(exists));
}
