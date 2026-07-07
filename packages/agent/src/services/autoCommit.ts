import { simpleGit } from "simple-git";

export interface AutoCommitResult {
  committed: boolean;
  hash?: string;
  message?: string;
  reason?: string;
}

/**
 * Commit the files a completed task edited (opt-in via config autoCommit).
 * Stages ONLY the task's edits — never `git add .` — and commits with a
 * message derived from the task. No-ops safely when not a git repo, nothing
 * to stage, or on any git error.
 */
export async function autoCommitEdits(
  workspaceRoot: string,
  task: string,
  edits: string[]
): Promise<AutoCommitResult> {
  if (edits.length === 0) return { committed: false, reason: "no edits" };

  const git = simpleGit(workspaceRoot);
  try {
    if (!(await git.checkIsRepo())) return { committed: false, reason: "not a git repo" };

    // `--` end-of-options: a model-created file named like a flag (e.g. `-x`,
    // `--author=…`) must be treated as a pathspec, never a git option.
    await git.add(["--", ...edits]);
    const status = await git.status();
    if (status.staged.length === 0) return { committed: false, reason: "nothing staged" };

    const firstLine = task.trim().replace(/\s+/g, " ");
    const subject = firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine;
    const message = `crayon: ${subject}`;

    await git.raw(["commit", "-m", message, "--", ...edits]);
    const hash = (await git.revparse(["HEAD"])).trim();
    return { committed: true, hash, message };
  } catch (e: any) {
    return { committed: false, reason: e?.message ?? String(e) };
  }
}
