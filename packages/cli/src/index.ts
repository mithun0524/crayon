#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import readline from "node:readline";
import path from "node:path";
import { CrayonAgent, type AgentEvent } from "@crayon/agent";
import { CodeIndexer } from "@crayon/indexer";
import { loadConfig, hasApiKey } from "./config.js";

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
    await runAgentOnce(task);
  });

program
  .command("chat")
  .description("Interactive agent session")
  .action(async () => {
    const config = await loadConfig();
    if (!hasApiKey(config)) {
      console.error(chalk.red("No API key found. Set OPENROUTER_API_KEY or create ~/.crayon/config.json"));
      process.exit(1);
    }

    console.log(chalk.cyan.bold("\n  Crayon Agent v0.1\n"));
    console.log(chalk.dim("Ask questions, request code changes, or type 'exit' to quit.\n"));

    const agent = new CrayonAgent({
      workspaceRoot: process.cwd(),
      model: config.defaultModel,
      provider: config.provider,
      anthropicApiKey: config.anthropicApiKey,
      openaiApiKey: config.openaiApiKey,
      openrouterApiKey: config.openrouterApiKey,
      onEvent: (event) => handleChatEvent(event),
      approveCommand: async (command) => {
        console.log(chalk.yellow(`\n⚠ Approve command: ${command}`));
        return askYesNo("Approve? (y/N): ");
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const ask = (): void => {
      rl.question(chalk.green("You: "), async (input) => {
        const trimmed = input.trim();

        if (trimmed === "exit" || trimmed === "quit") {
          console.log(chalk.dim("Goodbye."));
          agent.close();
          rl.close();
          return;
        }

        if (!trimmed) {
          ask();
          return;
        }

        if (trimmed === "clear") {
          agent.clearHistory();
          console.log(chalk.dim("Conversation cleared.\n"));
          ask();
          return;
        }

        try {
          process.stdout.write(chalk.dim("Crayon: thinking...\n"));
          await agent.run(trimmed);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ERR_USE_AFTER_CLOSE") return;
          console.error(chalk.red(`\nError: ${err instanceof Error ? err.message : String(err)}`));
        }

        process.stdin.resume();
        if ((rl as readline.Interface & { closed?: boolean }).closed) return;
        console.log("");
        ask();
      });
    };

    rl.on("close", () => agent.close());
    ask();
  });

async function runAgentOnce(task: string): Promise<void> {
  const config = await loadConfig();
  if (!hasApiKey(config)) {
    console.error(chalk.red("No API key found. Set OPENROUTER_API_KEY or create ~/.crayon/config.json"));
    process.exit(1);
  }

  let streamedText = false;
  const spinner = ora("Starting agent...").start();

  const agent = new CrayonAgent({
    workspaceRoot: process.cwd(),
    model: config.defaultModel,
    provider: config.provider,
    anthropicApiKey: config.anthropicApiKey,
    openaiApiKey: config.openaiApiKey,
    openrouterApiKey: config.openrouterApiKey,
    onEvent: (event) => {
      if (event.type === "text") streamedText = true;
      handleRunEvent(event, spinner);
    },
    approveCommand: async (command) => {
      spinner.stop();
      console.log(chalk.yellow(`\n⚠ Approve command: ${command}`));
      const ok = await askYesNo("Approve? (y/N): ");
      spinner.start();
      return ok;
    },
  });

  try {
    spinner.text = "Working...";
    const result = await agent.run(task, { skipHistory: true });

    spinner.stop();

    if (result.edits.length > 0) {
      console.log(result.success ? chalk.green.bold("\n✓ Done") : chalk.yellow.bold("\n⚠ Done with issues"));
      console.log(chalk.dim(`Edited: ${result.edits.join(", ")}`));
    }

    if (!streamedText && result.summary) {
      console.log(chalk.white(`\n${result.summary}`));
    }
  } catch (err) {
    spinner.fail("Failed");
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  } finally {
    agent.close();
  }
}

function handleChatEvent(event: AgentEvent): void {
  switch (event.type) {
    case "plan":
      console.log(chalk.blue.bold("\nPlan:"));
      event.steps.forEach((s, i) => console.log(chalk.blue(`  ${i + 1}. ${s}`)));
      break;
    case "tool_call":
      if (event.name !== "thinking") {
        console.log(chalk.dim(`  → ${event.name}`));
      }
      break;
    case "edit":
      console.log(chalk.magenta(`\n  Edit: ${event.path}`));
      break;
    case "eval":
      console.log(event.passed ? chalk.green("  ✓ Tests passed") : chalk.red("  ✗ Tests failed — retrying..."));
      break;
    case "text":
      process.stdout.write("\x1b[1A\x1b[2K");
      console.log(chalk.cyan("Crayon:"), event.content);
      break;
    case "error":
      process.stdout.write("\x1b[1A\x1b[2K");
      console.error(chalk.red(`Crayon: ${event.message}`));
      break;
    case "thinking":
      // status only during indexing
      break;
    case "done":
      break;
  }
}

function handleRunEvent(event: AgentEvent, spinner: Ora): void {
  switch (event.type) {
    case "plan":
      spinner.stop();
      console.log(chalk.blue.bold("\nPlan:"));
      event.steps.forEach((s, i) => console.log(chalk.blue(`  ${i + 1}. ${s}`)));
      spinner.start("Executing...");
      break;
    case "tool_call":
      spinner.text = `Tool: ${event.name}`;
      break;
    case "edit":
      spinner.stop();
      console.log(chalk.magenta(`\nEdit: ${event.path}`));
      spinner.start("Continuing...");
      break;
    case "eval":
      spinner.stop();
      console.log(event.passed ? chalk.green("✓ Tests passed") : chalk.red("✗ Tests failed"));
      spinner.start("Continuing...");
      break;
    case "text":
      spinner.stop();
      console.log(chalk.white(`\n${event.content}`));
      break;
    case "error":
      spinner.fail(event.message);
      break;
    case "done":
      spinner.stop();
      break;
    case "thinking":
      spinner.text = event.content;
      break;
  }
}

function askYesNo(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.yellow(prompt), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

program.parse();
