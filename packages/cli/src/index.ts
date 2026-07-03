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
  .action(async (task: string) => {
    const config = await loadConfig();
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
  .option("-r, --resume", "Resume the last active session")
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
      const sessionFile = path.join(process.cwd(), ".crayon", "sessions", "latest.json");
      if (existsSync(sessionFile)) {
        console.log(chalk.dim(`\n↻ Resume this session:  `) + chalk.cyan(`crayon chat --resume`));
      }
    } catch (err) {
      console.error(chalk.red(`TUI Error: ${err instanceof Error ? err.message : String(err)}`));
      await exitCLI(1);
    }
  });

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
    approveCommand: async (cmd) => {
      console.log(chalk.yellow(`\n⚠️ Auto-approving terminal command in non-TTY: ${cmd}`));
      return true;
    },
    approveEdit: async (filePath) => {
      console.log(chalk.yellow(`\n⚠️ Auto-approving file edit in non-TTY: ${filePath}`));
      return true;
    }
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
