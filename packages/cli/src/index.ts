#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import path from "node:path";
import { existsSync } from "node:fs";
import React from "react";
import { render } from "ink";
import { CrayonAgent } from "crayon-agent";
import { CodeIndexer } from "crayon-indexer";
import { loadConfig, hasApiKey } from "./config.js";
import { listSessions } from "./session.js";
import { App } from "./ui/App.js";
import { initTelemetry, trackEvent, flushTelemetry } from "./telemetry.js";
import { runOnboardingFlow } from "./onboarding.js";
import { handleUpdateOnBoot, showPassiveNotification, runInternalUpdateCheck, spawnBackgroundUpdateCheck } from "./updater.js";
import { enableTerminalSync } from "./terminal-sync.js";

// Enable DEC 2026 synchronous updates to prevent terminal tearing on resize
enableTerminalSync();

async function exitCLI(code: number = 0) {
  await showPassiveNotification();
  trackEvent("Agent Exited", { code });
  await flushTelemetry();
  process.exit(code);
}

const program = new Command();

// Internal command for background update check
if (process.argv.includes("--internal-check-update")) {
  await runInternalUpdateCheck();
  process.exit(0);
}

import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let pkgVersion = "0.1.0";
try {
  const pkgPath = path.resolve(__dirname, "../../package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    pkgVersion = pkg.version || "0.1.0";
  }
} catch {}

program
  .name("crayon")
  .description("Crayon — autonomous AI coding agent")
  .version(pkgVersion);

program
  .command("init")
  .description("Initialize .crayon/ and index the repository")
  .action(async () => {
    const workspaceRoot = process.cwd();
    const spinner = ora("Initializing Crayon...").start();

    try {
      const indexer = new CodeIndexer(workspaceRoot);
      await indexer.init();
      const stats = await indexer.index(true);
      const intel = await indexer.detectIntelligence();

      spinner.succeed(`Indexed ${stats.fileCount} files, ${stats.symbolCount} symbols`);
      console.log(chalk.dim("Project intelligence:"));
      console.log(JSON.stringify(intel, null, 2));
      console.log(chalk.green(`\n.crayon/ created at ${path.join(workspaceRoot, ".crayon")}`));
    } catch (err) {
      spinner.fail("Init failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      await exitCLI(1);
    }
  });

program
  .command("index")
  .description("Force re-index the workspace")
  .action(async () => {
    const workspaceRoot = process.cwd();
    const spinner = ora("Re-indexing...").start();

    try {
      const indexer = new CodeIndexer(workspaceRoot);
      await indexer.init();
      const stats = await indexer.index(true);
      spinner.succeed(`Indexed ${stats.fileCount} files, ${stats.symbolCount} symbols`);
    } catch (err) {
      spinner.fail("Index failed");
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      await exitCLI(1);
    }
  });

program
  .command("run")
  .description("Run a one-shot autonomous task")
  .argument("<task>", "Task description")
  .option("--json", "Headless mode: print a single JSON result object to stdout (no UI, no prompts)")
  .option("-m, --mode <mode>", "Permission mode (ask, auto-edit, plan, auto, bypass)")
  .action(async (task: string, options: { json?: boolean; mode?: string }) => {
    const config = await loadConfig();

    if (options.json) {
      // Headless: no update prompts, no onboarding, machine-readable output only.
      if (!hasApiKey(config)) {
        process.stdout.write(JSON.stringify({ success: false, error: "No API key configured. Run 'crayon config' first." }) + "\n");
        await flushTelemetry().catch(() => {});
        process.exit(2); // NOT exitCLI — it prints the update box to stdout
        return;
      }
      await runHeadlessJson(task, config, options.mode);
      return;
    }

    await handleUpdateOnBoot(config);
    spawnBackgroundUpdateCheck();

    if (!hasApiKey(config)) {
      await runOnboardingFlow();
      Object.assign(config, await loadConfig());
    }

    const isTTY = process.stdin.isTTY && typeof process.stdin.setRawMode === "function";

    if (!isTTY) {
      await runFallback(task);
      return;
    }

    try {
      const { waitUntilExit } = render(React.createElement(App, { mode: "run", task }));
      await waitUntilExit();
    } catch (err) {
      console.error(chalk.red(`TUI Error: ${err instanceof Error ? err.message : String(err)}`));
      await exitCLI(1);
    }
  });

program
  .command("chat")
  .description("Interactive agent session")
  .option("-r, --resume [id]", "Resume the most recent session, or a specific session id")
  .option("-m, --mode <mode>", "Permission mode (ask, auto-edit, plan, auto, bypass)")
  .action(async (options) => {
    const config = await loadConfig();
    await handleUpdateOnBoot(config);
    spawnBackgroundUpdateCheck();

    if (!hasApiKey(config)) {
      await runOnboardingFlow();
      Object.assign(config, await loadConfig());
    }

    const isTTY = process.stdin.isTTY && typeof process.stdin.setRawMode === "function";

    if (!isTTY) {
      console.error(chalk.red("Interactive chat mode requires an active TTY terminal interface."));
      await exitCLI(1);
    }


    try {
      const { waitUntilExit } = render(React.createElement(App, {
        mode: "chat",
        resume: options.resume,
        permissionMode: options.mode as any
      }));
      await waitUntilExit();

      // Point the user back to their session (kept in scrollback above).
      const sessions = await listSessions(process.cwd());
      if (sessions.length > 0) {
        console.log(
          chalk.dim(`\n↻ Resume:  `) + chalk.cyan(`crayon chat --resume ${sessions[0].id}`) +
          chalk.dim(`   ·  list all:  `) + chalk.cyan(`crayon sessions`)
        );
      }
    } catch (err) {
      console.error(chalk.red(`TUI Error: ${err instanceof Error ? err.message : String(err)}`));
      await exitCLI(1);
    }
  });

/**
 * Headless JSON mode: run one task, print exactly one JSON object to stdout.
 * All human-facing noise goes to stderr. Exit code 0 on success, 1 on failure.
 * There is no interactivity: approvals auto-resolve by permission mode
 * (default "auto" — reads/edits allowed, dangerous commands denied).
 */
async function runHeadlessJson(task: string, config: Awaited<ReturnType<typeof loadConfig>>, mode?: string) {
  const started = Date.now();
  const edits = new Set<string>();
  const toolCalls: Array<{ name: string; ok: boolean }> = [];
  const errors: string[] = [];
  let tokens = 0;

  const permissionMode = (mode as any) || "auto";

  const agent = new CrayonAgent({
    workspaceRoot: process.cwd(),
    model: config.defaultModel,
    provider: config.provider,
    anthropicApiKey: config.anthropicApiKey,
    openaiApiKey: config.openaiApiKey,
    openrouterApiKey: config.openrouterApiKey,
    googleApiKey: config.googleApiKey,
    mcpServers: config.mcpServers,
    verifyCommand: config.verifyCommand,
    autoCommit: config.autoCommit,
    permissionMode,
    onEvent: (event) => {
      if (process.env.CRAYON_DEBUG) {
        const info = (event as any).content || (event as any).message || (event as any).name || "";
        process.stderr.write(`[dbg +${((Date.now() - started) / 1000).toFixed(2)}s] ${event.type} ${String(info).slice(0, 80)}\n`);
      }
      switch (event.type) {
        case "edit": edits.add(event.path); break;
        case "tool_result": {
          const r = event.result as any;
          toolCalls.push({ name: event.name, ok: !(r && (r.success === false || r.error)) });
          break;
        }
        case "usage": tokens += event.totalTokens; break;
        case "error": errors.push(event.message); break;
        case "thinking": case "text_delta": case "reasoning_delta":
          break; // progress noise — omitted in JSON mode
      }
    },
    // Headless cannot prompt. Anything the permission mode doesn't auto-allow is denied.
    approveCommand: async () => false,
    approveEdit: async () => false,
  });

  let result: { success: boolean; summary: string; steps: number; edits: string[] } | null = null;
  let fatal: string | null = null;
  try {
    result = await agent.run(task, { skipHistory: true });
  } catch (err) {
    fatal = err instanceof Error ? err.message : String(err);
  } finally {
    agent.close();
  }

  const out = {
    success: result?.success === true && !fatal,
    task,
    summary: result?.summary ?? "",
    error: fatal ?? (errors.length ? errors.join("; ") : undefined),
    edits: result ? result.edits : [...edits],
    steps: result?.steps ?? 0,
    toolCalls,
    tokens,
    durationMs: Date.now() - started,
    model: config.defaultModel,
    permissionMode,
  };
  // Write synchronously and wait for the pipe to drain before exiting —
  // console.log + process.exit can silently drop buffered stdout on pipes.
  await new Promise<void>((resolve) => {
    process.stdout.write(JSON.stringify(out) + "\n", () => resolve());
  });
  // Exit directly — exitCLI() calls showPassiveNotification() which prints an
  // "update available" box to stdout and would corrupt the single-JSON output.
  await flushTelemetry().catch(() => {});
  process.exit(out.success ? 0 : 1);
}

async function runFallback(task: string) {
  const config = await loadConfig();
  console.log(chalk.cyan(`Crayon (non-TTY fallback mode) — Workspace: ${path.basename(process.cwd())}`));

  const agent = new CrayonAgent({
    workspaceRoot: process.cwd(),
    model: config.defaultModel,
    provider: config.provider,
    anthropicApiKey: config.anthropicApiKey,
    openaiApiKey: config.openaiApiKey,
    openrouterApiKey: config.openrouterApiKey,
    googleApiKey: config.googleApiKey,
    mcpServers: config.mcpServers,
    verifyCommand: config.verifyCommand,
    autoCommit: config.autoCommit,
    // Non-TTY (CI/pipes): can't prompt, so the permission mode decides.
    // Default "auto" allows reads/edits but denies dangerous commands; the
    // deny-approvals below ensure nothing the mode gates gets a blanket yes.
    permissionMode: (config.permissionMode as any) || "auto",
    onEvent: (event) => {
      switch (event.type) {
        case "plan":
          console.log(chalk.blue.bold("\nPlan:"));
          event.steps.forEach((s, i) => console.log(chalk.blue(`  ${i + 1}. ${s}`)));
          console.log("");
          break;
        case "thinking":
          break;
        case "tool_call":
          if (event.name !== "thinking") {
            console.log(chalk.dim(`🔨 Running tool: ${event.name}`));
          }
          break;
        case "text_delta":
          process.stdout.write(event.content);
          break;
        case "edit":
          console.log(chalk.green(`\n✏️ Edited: ${event.path}`));
          break;
        case "eval":
          console.log(event.passed ? chalk.green("✓ Tests passed") : chalk.red("✗ Tests failed"));
          break;
        case "error":
          console.error(chalk.red(`\nError: ${event.message}`));
          break;
      }
    },
    // No interactive prompt available — deny anything the permission mode
    // doesn't already auto-allow (never blanket-approve dangerous commands).
    approveCommand: async (cmd) => {
      console.error(chalk.yellow(`⚠️ Denied (no TTY to approve): ${cmd.slice(0, 80)}. Use --mode bypass to allow, or run interactively.`));
      return false;
    },
    approveEdit: async () => false,
  });

  try {
    const result = await agent.run(task, { skipHistory: true });
    console.log(chalk.green.bold("\n✓ Completed successfully."));
    if (result.summary) {
      console.log(chalk.white(`\nSummary:\n${result.summary}`));
    }
  } catch (err: any) {
    console.error(chalk.red(`\nFailed: ${err.message || String(err)}`));
    await exitCLI(1);
  } finally {
    agent.close();
  }
}

const mcpCmd = program
  .command("mcp")
  .description("Manage MCP (Model Context Protocol) servers");

mcpCmd
  .command("add")
  .description("Add an MCP server")
  .argument("<name>", "Server name")
  .argument("<command>", "Execution command (e.g., node, npx, python)")
  .argument("[args...]", "Command arguments")
  .action(async (name, command, args) => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const mcpPath = path.join(os.homedir(), ".crayon", "mcp.json");
    let mcpConfig: any = { mcpServers: {} };
    if (existsSync(mcpPath)) {
      mcpConfig = JSON.parse(await fs.readFile(mcpPath, "utf-8"));
      if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
    }
    mcpConfig.mcpServers[name] = { command, args, env: {} };
    await fs.mkdir(path.dirname(mcpPath), { recursive: true });
    await fs.writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2));
    console.log(chalk.green(`Added MCP server: ${name}`));
  });

mcpCmd
  .command("list")
  .description("List MCP servers")
  .action(async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const mcpPath = path.join(os.homedir(), ".crayon", "mcp.json");
    if (!existsSync(mcpPath)) {
      console.log("No MCP servers configured.");
      return;
    }
    const mcpConfig = JSON.parse(await fs.readFile(mcpPath, "utf-8"));
    if (!mcpConfig.mcpServers || Object.keys(mcpConfig.mcpServers).length === 0) {
      console.log("No MCP servers configured.");
      return;
    }
    console.log(chalk.cyan("Configured MCP Servers:"));
    for (const [name, conf] of Object.entries<any>(mcpConfig.mcpServers)) {
      console.log(chalk.green(`- ${name}`) + `: ${conf.command} ${(conf.args || []).join(" ")}`);
    }
  });

program
  .command("config")
  .description("Manage Crayon configuration")
  .action(async () => {
    const chalk = (await import("chalk")).default;
    const { confirm } = await import("@inquirer/prompts");
    const { getConfigPath } = await import("./config.js");
    const configPath = getConfigPath();
    console.log(chalk.green(`Configuration path: ${configPath}`));
    
    const reconfigure = await confirm({
      message: 'Would you like to re-run the configuration wizard?',
      default: false,
    });
    
    if (reconfigure) {
      const { runOnboardingFlow } = await import("./onboarding.js");
      await runOnboardingFlow();
    }
  });

program
  .command("update")
  .description("Force update Crayon to the latest version")
  .action(async () => {
    const ora = (await import("ora")).default;
    const spinner = ora("Checking for updates...").start();
    try {
      const { runInternalUpdateCheck } = await import("./updater.js");
      await runInternalUpdateCheck();
      
      const { execSync } = await import("node:child_process");
      spinner.text = "Updating Crayon via npm...";
      execSync("npm install -g crayon-cli@latest", { stdio: "inherit" });
      spinner.succeed("Update complete! You are now running the latest version of Crayon.");
    } catch (e: any) {
      spinner.fail("Failed to update.");
      console.error(chalk.red(e.message));
      await exitCLI(1);
    }
  });

program
  .command("serve")
  .description("Start Crayon MCP server on stdio")
  .action(async () => {
    const { runMcpServer } = await import("crayon-agent");
    await runMcpServer();
  });

program
  .command("sessions")
  .description("List saved chat sessions for this workspace")
  .action(async () => {
    const sessions = await listSessions(process.cwd());
    if (sessions.length === 0) {
      console.log(chalk.dim("No saved sessions in this workspace."));
      return;
    }
    console.log(chalk.bold("Sessions (newest first):\n"));
    for (const s of sessions) {
      const when = s.timestamp ? new Date(s.timestamp).toLocaleString() : "unknown";
      console.log(
        `  ${chalk.cyan(s.id)}  ${chalk.dim(when)}  ${chalk.dim(`(${s.messageCount} msgs)`)}\n` +
        `      ${s.title}`
      );
    }
    console.log(chalk.dim(`\nResume:  crayon chat --resume <id>`));
  });

program
  .command("tasks")
  .description("List all tasks")
  .action(async () => {
    const { TaskManager } = await import("crayon-agent");
    const manager = new TaskManager(process.cwd());
    const tasks = await manager.listTasks();
    if (tasks.length === 0) {
      console.log("No tasks found.");
      return;
    }
    console.log(chalk.cyan("Tasks:"));
    for (const t of tasks) {
      const color = t.status === "completed" ? chalk.green : t.status === "failed" ? chalk.red : chalk.yellow;
      console.log(`${color(`[${t.status}]`)} ${t.id} - ${t.description}`);
    }
  });

program
  .command("resume")
  .description("Resume an interrupted task")
  .argument("<taskId>", "ID of the task to resume")
  .action(async (taskId) => {
    const { TaskManager } = await import("crayon-agent");
    const manager = new TaskManager(process.cwd());
    const task = await manager.getTask(taskId);
    if (!task) {
      console.error(chalk.red(`Task not found: ${taskId}`));
      return;
    }
    console.log(chalk.blue(`Resuming task: ${task.description}`));
    // Simplified resume flow
    await runFallback(task.description);
  });

program
  .command("queue")
  .description("Queue multiple tasks to run sequentially")
  .argument("<tasks...>", "Tasks to queue")
  .action(async (tasks) => {
    for (let i = 0; i < tasks.length; i++) {
      console.log(chalk.magenta.bold(`\n--- Running queued task ${i + 1}/${tasks.length}: ${tasks[i]} ---`));
      await runFallback(tasks[i]);
    }
  });

async function runMain() {
  await initTelemetry();
  trackEvent("Agent Started");

  process.on("uncaughtException", (err) => {
    console.error(chalk.red("\nFatal Error (uncaughtException):"));
    console.error(err);
    trackEvent("Agent Error", { error: err.message, type: "uncaughtException" });
    flushTelemetry().finally(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    console.error(chalk.red("\nFatal Error (unhandledRejection):"));
    console.error(reason);
    trackEvent("Agent Error", { error: String(reason), type: "unhandledRejection" });
    flushTelemetry().finally(() => process.exit(1));
  });

  await program.parseAsync(process.argv);
  await exitCLI(0);
}

runMain().catch(async (err) => {
  trackEvent("Agent Error", { error: err.message, type: "mainError" });
  await flushTelemetry();
  process.exit(1);
});
