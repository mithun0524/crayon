import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { simpleGit, type SimpleGit } from "simple-git";

export interface WorktreeInfo {
  /** Absolute path to the worktree directory. */
  path: string;
  /** The branch checked out in this worktree. */
  branch: string;
  /** The HEAD commit SHA. */
  head: string;
  /** Short label given at creation time (extracted from branch name). */
  label: string;
  /** ISO timestamp of creation (extracted from branch name). */
  createdAt: string;
}

/**
 * Manages isolated Git worktrees for safe agent sandboxing.
 *
 * Worktrees live at:
 *   <workspaceRoot>/.crayon/worktrees/<label>-<timestamp>/
 *
 * The corresponding branch is:
 *   crayon/sandbox/<label>-<timestamp>
 *
 * The parent branch at creation time is used as the base for `diff` and
 * `merge` operations.
 */
export class WorktreeManager {
  private readonly git: SimpleGit;
  private readonly worktreesDir: string;

  constructor(workspaceRoot: string) {
    this.git = simpleGit(workspaceRoot);
    this.worktreesDir = path.join(workspaceRoot, ".crayon", "worktrees");
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Create a new sandbox worktree from the current HEAD.
   *
   * @param label  Short human-readable label (e.g. "refactor-auth"). Sanitised
   *               automatically — only alphanumeric + hyphen chars are kept.
   * @returns      The worktree path and the new branch name.
   */
  async create(label: string): Promise<{ worktreePath: string; branch: string }> {
    await this.ensureWorktreesDir();

    const safe = this.sanitise(label);
    const ts = Date.now();
    const slug = `${safe}-${ts}`;
    const branch = `crayon/sandbox/${slug}`;
    const worktreePath = path.join(this.worktreesDir, slug);

    // Check git version supports worktrees (≥ 2.5)
    await this.assertWorktreeSupport();

    // Create the new branch + worktree in one command.
    await this.git.raw(["worktree", "add", "-b", branch, worktreePath, "HEAD"]);

    return { worktreePath, branch };
  }

  /**
   * List all active Crayon-managed sandbox worktrees.
   */
  async list(): Promise<WorktreeInfo[]> {
    const raw = await this.git.raw(["worktree", "list", "--porcelain"]);
    return this.parsePorcelain(raw).filter((wt) =>
      wt.branch.startsWith("crayon/sandbox/")
    );
  }

  /**
   * Unified diff between the worktree branch and the branch it was created
   * from (its merge-base with HEAD of the main worktree).
   */
  async diff(worktreePath: string): Promise<string> {
    const info = await this.findWorktree(worktreePath);
    if (!info) throw new Error(`No managed worktree found at: ${worktreePath}`);

    // Use the merge-base of the sandbox branch and the primary worktree's HEAD
    // so we only show changes made *inside* the sandbox.
    const primaryHead = await this.git.revparse(["HEAD"]);
    const mergeBase = (
      await this.git.raw(["merge-base", info.head, primaryHead.trim()])
    ).trim();

    const diff = await this.git.raw([
      "diff",
      mergeBase,
      info.head,
    ]);
    return diff || "(no changes in worktree)";
  }

  /**
   * Merge the sandbox branch into the current branch of the primary worktree,
   * then clean up the worktree. Returns any merge conflicts as file paths.
   *
   * The merge uses `--no-ff` so there is always a merge commit, making it
   * easy to revert with a single `git revert -m 1 <merge-sha>`.
   */
  async merge(worktreePath: string): Promise<{ merged: boolean; conflicts: string[] }> {
    const info = await this.findWorktree(worktreePath);
    if (!info) throw new Error(`No managed worktree found at: ${worktreePath}`);

    try {
      await this.git.merge(["--no-ff", info.branch]);
      // Merge succeeded — clean up.
      await this.cleanup(worktreePath, info.branch);
      return { merged: true, conflicts: [] };
    } catch (err: any) {
      // Detect merge conflicts.
      const status = await this.git.status();
      const conflicts = status.conflicted;
      if (conflicts.length > 0) {
        // Abort to keep the primary worktree clean; the sandbox stays alive.
        await this.git.merge(["--abort"]).catch(() => {});
        return { merged: false, conflicts };
      }
      throw err;
    }
  }

  /**
   * Remove a sandbox worktree without merging. All changes in the worktree
   * are discarded.
   *
   * @param worktreePath  Absolute path returned by `create()`.
   * @param force         Pass true to force-remove even if there are local
   *                      modifications (default: true for safety since the
   *                      caller has already decided to discard).
   */
  async remove(worktreePath: string, force = true): Promise<void> {
    const info = await this.findWorktree(worktreePath);
    if (!info) {
      // Already gone — nothing to do.
      return;
    }
    await this.cleanup(worktreePath, info.branch, force);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async ensureWorktreesDir(): Promise<void> {
    await mkdir(this.worktreesDir, { recursive: true });
  }

  private sanitise(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "sandbox";
  }

  private async assertWorktreeSupport(): Promise<void> {
    const raw = await this.git.raw(["--version"]);
    // e.g. "git version 2.39.0.windows.1"
    const match = raw.match(/(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major < 2 || (major === 2 && minor < 5)) {
        throw new Error(
          `git worktree requires Git ≥ 2.5 (found ${match[0]}). Please upgrade Git.`
        );
      }
    }
  }

  private parsePorcelain(raw: string): WorktreeInfo[] {
    const results: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> & { rawPath?: string } = {};

    for (const line of raw.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.rawPath) {
          results.push(this.enrichWorktree(current as any));
        }
        current = { rawPath: line.slice("worktree ".length).trim() };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length).trim();
      } else if (line.startsWith("branch ")) {
        // e.g. "branch refs/heads/crayon/sandbox/foo-123"
        current.branch = line.slice("branch ".length).replace("refs/heads/", "").trim();
      } else if (line.trim() === "") {
        if (current.rawPath) {
          results.push(this.enrichWorktree(current as any));
          current = {};
        }
      }
    }
    if (current.rawPath) results.push(this.enrichWorktree(current as any));

    return results;
  }

  private enrichWorktree(raw: {
    rawPath: string;
    head?: string;
    branch?: string;
  }): WorktreeInfo {
    const branch = raw.branch ?? "";
    // Extract label and timestamp from "crayon/sandbox/<label>-<timestamp>"
    const slug = branch.replace("crayon/sandbox/", "");
    const tsMatch = slug.match(/-(\d{13})$/);
    const ts = tsMatch ? parseInt(tsMatch[1], 10) : 0;
    const label = tsMatch ? slug.slice(0, -tsMatch[0].length) : slug;

    return {
      path: raw.rawPath,
      branch,
      head: raw.head ?? "",
      label,
      createdAt: ts ? new Date(ts).toISOString() : "",
    };
  }

  private async findWorktree(worktreePath: string): Promise<WorktreeInfo | null> {
    const abs = path.resolve(worktreePath);
    const list = await this.list();
    return list.find((wt) => path.resolve(wt.path) === abs) ?? null;
  }

  private async cleanup(
    worktreePath: string,
    branch: string,
    force = true
  ): Promise<void> {
    const args = ["worktree", "remove"];
    if (force) args.push("--force");
    args.push(worktreePath);

    try {
      await this.git.raw(args);
    } catch {
      // Fallback: manually remove the directory and prune.
      if (existsSync(worktreePath)) {
        await rm(worktreePath, { recursive: true, force: true });
      }
      await this.git.raw(["worktree", "prune"]).catch(() => {});
    }

    // Delete the sandbox branch (ignore if already gone).
    await this.git.deleteLocalBranch(branch, true).catch(() => {});
  }
}

export function createWorktreeManager(workspaceRoot: string): WorktreeManager {
  return new WorktreeManager(workspaceRoot);
}
