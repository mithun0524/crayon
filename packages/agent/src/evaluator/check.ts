import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export interface EvalResult {
  passed: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function detectTestCommand(workspaceRoot: string): Promise<string | null> {
  const pkgPath = path.join(workspaceRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
        const pm = detectPackageManager(workspaceRoot);
        return `${pm} test`;
      }
      if (pkg.scripts?.build) {
        const pm = detectPackageManager(workspaceRoot);
        return `${pm} run build`;
      }
    } catch {
      // ignore
    }
  }

  if (existsSync(path.join(workspaceRoot, "Cargo.toml"))) {
    return "cargo test";
  }

  if (existsSync(path.join(workspaceRoot, "pyproject.toml")) || existsSync(path.join(workspaceRoot, "setup.py"))) {
    return "python -m pytest";
  }

  if (existsSync(path.join(workspaceRoot, "go.mod"))) {
    return "go test ./...";
  }

  return null;
}

function detectPackageManager(workspaceRoot: string): string {
  if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  return "npm";
}

export async function runEvaluation(workspaceRoot: string): Promise<EvalResult | null> {
  const command = await detectTestCommand(workspaceRoot);
  if (!command) return null;

  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const shell = isWin ? "powershell.exe" : "/bin/sh";
    const shellFlag = isWin ? "-Command" : "-c";

    const proc = spawn(shell, [shellFlag, command], {
      cwd: workspaceRoot,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({
        passed: false,
        command,
        stdout,
        stderr: stderr + "\n[timeout after 120s]",
        exitCode: -1,
      });
    }, 120000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        passed: code === 0,
        command,
        stdout: stdout.slice(0, 10000),
        stderr: stderr.slice(0, 5000),
        exitCode: code ?? -1,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        passed: false,
        command,
        stdout,
        stderr: err.message,
        exitCode: -1,
      });
    });
  });
}
