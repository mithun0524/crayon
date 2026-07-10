import { z } from "zod";
import type { WorktreeManager } from "../services/WorktreeManager.js";

/**
 * Register the five Git worktree sandbox tools.
 *
 * These tools let Crayon create isolated Git worktrees for safe
 * experimentation. The developer's primary workspace is untouched until
 * they explicitly approve a merge.
 */
export function createWorktreeTools(worktreeManager: WorktreeManager) {
  return {
    // concurrent: false | readonly: false | permission: none
    worktree_create: {
      description:
        "Create an isolated Git worktree sandbox on a new branch (crayon/sandbox/<label>-<ts>). " +
        "Use this before risky or exploratory edits so the developer's working tree stays untouched. " +
        "Returns the absolute path to the worktree directory and the branch name. " +
        "Work inside that path using the standard file-editing tools.",
      parameters: z.object({
        label: z
          .string()
          .describe(
            "Short human-readable label for the sandbox (e.g. 'refactor-auth', 'experiment'). " +
              "Only alphanumeric characters and hyphens; max 40 chars."
          ),
      }),
      execute: async ({ label }: { label: string }) => {
        try {
          const result = await worktreeManager.create(label);
          return {
            success: true,
            worktreePath: result.worktreePath,
            branch: result.branch,
            message:
              `Sandbox created. Work inside: ${result.worktreePath}\n` +
              `Branch: ${result.branch}\n` +
              `Use worktree_merge to apply or worktree_remove to discard when done.`,
          };
        } catch (err: any) {
          return { success: false, error: err?.message ?? String(err) };
        }
      },
    },

    // concurrent: true | readonly: true | permission: none
    worktree_list: {
      description:
        "List all active Crayon-managed Git worktree sandboxes for this repository. " +
        "Returns path, branch, HEAD commit, label, and creation time for each sandbox.",
      parameters: z.object({}),
      execute: async () => {
        try {
          const sandboxes = await worktreeManager.list();
          return {
            success: true,
            count: sandboxes.length,
            sandboxes: sandboxes.map((wt) => ({
              path: wt.path,
              branch: wt.branch,
              head: wt.head,
              label: wt.label,
              createdAt: wt.createdAt,
            })),
          };
        } catch (err: any) {
          return { success: false, error: err?.message ?? String(err) };
        }
      },
    },

    // concurrent: true | readonly: true | permission: none
    worktree_diff: {
      description:
        "Show a unified diff of all changes made inside a worktree sandbox " +
        "relative to the commit it was branched from. " +
        "Use to review work before merging or discarding.",
      parameters: z.object({
        worktree_path: z
          .string()
          .describe("Absolute path to the worktree directory (returned by worktree_create or worktree_list)."),
      }),
      execute: async ({ worktree_path }: { worktree_path: string }) => {
        try {
          const diff = await worktreeManager.diff(worktree_path);
          return { success: true, diff };
        } catch (err: any) {
          return { success: false, error: err?.message ?? String(err) };
        }
      },
    },

    // concurrent: false | readonly: false | permission: none
    worktree_merge: {
      description:
        "Merge a worktree sandbox branch into the current branch of the primary workspace " +
        "using --no-ff (always creates a merge commit). " +
        "On success, the worktree directory and branch are removed automatically. " +
        "On conflict, the merge is aborted and the sandbox is preserved; " +
        "conflicts are listed so the agent can resolve them manually.",
      parameters: z.object({
        worktree_path: z
          .string()
          .describe("Absolute path to the worktree directory (returned by worktree_create or worktree_list)."),
      }),
      execute: async ({ worktree_path }: { worktree_path: string }) => {
        try {
          const result = await worktreeManager.merge(worktree_path);
          if (result.merged) {
            return {
              success: true,
              merged: true,
              message: "Sandbox merged successfully. Worktree and branch cleaned up.",
            };
          } else {
            return {
              success: false,
              merged: false,
              conflicts: result.conflicts,
              message:
                `Merge conflict in ${result.conflicts.length} file(s). ` +
                `Merge aborted — sandbox preserved. Resolve conflicts or discard with worktree_remove.`,
            };
          }
        } catch (err: any) {
          return { success: false, error: err?.message ?? String(err) };
        }
      },
    },

    // concurrent: false | readonly: false | permission: none
    worktree_remove: {
      description:
        "Discard a worktree sandbox without merging — all changes inside are lost. " +
        "The worktree directory and the sandbox branch are both deleted.",
      parameters: z.object({
        worktree_path: z
          .string()
          .describe("Absolute path to the worktree directory (returned by worktree_create or worktree_list)."),
      }),
      execute: async ({ worktree_path }: { worktree_path: string }) => {
        try {
          await worktreeManager.remove(worktree_path);
          return {
            success: true,
            message: `Sandbox discarded. Worktree directory and branch removed: ${worktree_path}`,
          };
        } catch (err: any) {
          return { success: false, error: err?.message ?? String(err) };
        }
      },
    },
  };
}
