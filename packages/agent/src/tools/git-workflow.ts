import { z } from "zod";
import { simpleGit } from "simple-git";
import type { ToolContext } from "../types.js";

export function createGitTools(ctx: ToolContext) {
  const git = simpleGit(ctx.workspaceRoot);

  // Mirror the core tools' permission model: auto/bypass allow, plan blocks,
  // otherwise ask — and DENY by default when no approver is wired (the old
  // `?? true` silently allowed mutating git ops in that case).
  const approve = async (command: string): Promise<boolean> => {
    if (ctx.permissionMode === "bypass" || ctx.permissionMode === "auto") return true;
    if (ctx.permissionMode === "plan") return false;
    return (await ctx.approveCommand?.(command)) ?? false;
  };

  return {
    // concurrent: false | readonly: false | permission: ask
    git_create_branch: {
      description: "Create and checkout a new git branch.",
      parameters: z.object({
        branch_name: z.string().describe("Name of the new branch"),
      }),
      execute: async ({ branch_name }: { branch_name: string }) => {
        const approved = await approve(`git checkout -b ${branch_name}`);
        if (!approved) return { error: "PERMISSION_DENIED_BY_USER" };
        
        try {
          await git.checkoutLocalBranch(branch_name);
          return { success: true, message: `Checked out new branch: ${branch_name}` };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    },

    // concurrent: false | readonly: false | permission: ask
    git_stash: {
      description: "Stash local changes.",
      parameters: z.object({
        message: z.string().optional().describe("Optional stash message"),
      }),
      execute: async ({ message }: { message?: string }) => {
        const approved = await approve(`git stash${message ? ` save "${message}"` : ''}`);
        if (!approved) return { error: "PERMISSION_DENIED_BY_USER" };
        
        try {
          const result = message ? await git.stash(['save', message]) : await git.stash();
          return { success: true, result };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    },

    // concurrent: false | readonly: false | permission: ask
    git_stash_pop: {
      description: "Pop the latest stashed changes.",
      parameters: z.object({}),
      execute: async () => {
        const approved = await approve(`git stash pop`);
        if (!approved) return { error: "PERMISSION_DENIED_BY_USER" };
        
        try {
          const result = await git.stash(['pop']);
          return { success: true, result };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },
    },

    // concurrent: false | readonly: false | permission: ask
    git_push: {
      description: "Push local commits to a remote branch.",
      parameters: z.object({
        remote: z.string().default("origin").describe("Remote name (default: origin)"),
        branch: z.string().describe("Branch name to push"),
      }),
      execute: async ({ remote, branch }: { remote: string; branch: string }) => {
        const approved = await approve(`git push -u ${remote} ${branch}`);
        if (!approved) return { error: "PERMISSION_DENIED_BY_USER" };
        
        try {
          const result = await git.push(remote, branch, ['-u']);
          return { success: true, result: result.pushed };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      }
    }
  };
}
