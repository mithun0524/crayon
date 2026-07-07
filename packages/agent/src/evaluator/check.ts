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

/**
 * Run the post-edit verification.
 * - verifyCommand === "none"          → verification disabled, returns null
 * - verifyCommand set (any string)    → run EXACTLY that command (no tsc
 *   pre-check, no detection — explicit config is authoritative)
 * - verifyCommand unset               → auto-detect (tsc pre-check + test/build)
 */
export async function runEvaluation(workspaceRoot: string, verifyCommand?: string): Promise<EvalResult | null> {
  const isWin = process.platform === "win32";
  const shell = isWin ? "powershell.exe" : "/bin/sh";
  const shellFlag = isWin ? "-Command" : "-c";

  if (verifyCommand === "none") return null;
  if (verifyCommand && verifyCommand.trim()) {
    return execEval(verifyCommand.trim(), workspaceRoot, shell, shellFlag);
  }

  // Pre-check: Typescript compile
  if (existsSync(path.join(workspaceRoot, "tsconfig.json"))) {
    const pm = detectPackageManager(workspaceRoot);
    const tscCmd = `${pm} exec tsc --noEmit`;
    const tscResult = await new Promise<EvalResult>((resolve) => {
      const proc = spawn(shell, [shellFlag, tscCmd], { cwd: workspaceRoot });
      let stdout = ""; let stderr = "";
      proc.stdout.on("data", d => stdout += d.toString());
      proc.stderr.on("data", d => stderr += d.toString());
      proc.on("close", code => resolve({ passed: code === 0, command: tscCmd, stdout, stderr, exitCode: code ?? -1 }));
      proc.on("error", err => resolve({ passed: false, command: tscCmd, stdout, stderr: err.message, exitCode: -1 }));
    });
    
    // If TS fails, return immediately to fix types before running tests
    if (!tscResult.passed) {
      return tscResult;
    }
  }

  const command = await detectTestCommand(workspaceRoot);
  if (!command) return null;

  return execEval(command, workspaceRoot, shell, shellFlag);
}

function execEval(command: string, workspaceRoot: string, shell: string, shellFlag: string): Promise<EvalResult> {
  return new Promise((resolve) => {
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
