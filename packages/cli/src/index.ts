#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import path from "node:path";
import React from "react";
import { render } from "ink";
import { CrayonAgent } from "@crayon/agent";
import { CodeIndexer } from "@crayon/indexer";
import { loadConfig, hasApiKey } from "./config.js";
import { App } from "./ui/App.js";

const program = new Command();

program
  .name("crayon")
  .description("Crayon — autonomous AI coding agent")
  .version("0.1.0");

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
      process.exit(1);
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
      process.exit(1);
    }
  });

program
  .command("run")
  .description("Run a one-shot autonomous task")
  .argument("<task>", "Task description")
  .action(async (task: string) => {
    const config = await loadConfig();
    if (!hasApiKey(config)) {
      console.error(chalk.red("No API key found. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or create ~/.crayon/config.json"));
      process.exit(1);
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
      process.exit(1);
    }
  });

program
  .command("chat")
  .description("Interactive agent session")
  .action(async () => {
    const config = await loadConfig();
    if (!hasApiKey(config)) {
      console.error(chalk.red("No API key found. Set GEMINI_API_KEY, ANTHROPIC_API_KEY, or create ~/.crayon/config.json"));
      process.exit(1);
    }

    const isTTY = process.stdin.isTTY && typeof process.stdin.setRawMode === "function";

    if (!isTTY) {
      console.error(chalk.red("Interactive chat mode requires an active TTY terminal interface."));
      process.exit(1);
    }

    try {
      const { waitUntilExit } = render(React.createElement(App, { mode: "chat" }));
      await waitUntilExit();
    } catch (err) {
      console.error(chalk.red(`TUI Error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
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
    process.exit(1);
  } finally {
    agent.close();
  }
}

program.parse();
