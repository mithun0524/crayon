import { execSync } from "node:child_process";

export function getGitInfo(workspaceRoot: string) {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: workspaceRoot, encoding: "utf8" }).trim();
    const status = execSync("git status --porcelain", { cwd: workspaceRoot, encoding: "utf8" });
    const dirtyCount = status.split("\n").filter(line => line.trim().length > 0).length;
    return { branch, dirtyCount };
  } catch {
    return { branch: "none", dirtyCount: 0 };
  }
}
