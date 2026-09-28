import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Everything Crayon writes under <workspace>/.crayon is machine-local runtime
// state (index, sessions, backups, logs, scratchpad) — except commands/, which
// teams check in. A self-ignoring directory keeps `git status` clean without
// touching the user's own .gitignore.
const GITIGNORE = `# Crayon runtime state (local to this machine). commands/ is meant to be shared.
*
!commands/
!commands/**
`;

export async function ensureCrayonDir(workspaceRoot: string): Promise<string> {
  const dir = path.join(workspaceRoot, ".crayon");
  const ignore = path.join(dir, ".gitignore");
  if (!existsSync(ignore)) {
    await mkdir(dir, { recursive: true });
    await writeFile(ignore, GITIGNORE, "utf-8").catch(() => {});
  }
  return dir;
}

/** The agent's scratchpad lives inside .crayon/ rather than littering the repo root. */
export const TODO_FILE = path.join(".crayon", "todo.md");
