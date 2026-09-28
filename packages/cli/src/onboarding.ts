import { select, input, password, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { POPULAR_MODELS } from './ui/appConstants.js';
import { ollamaHost, fetchOllamaModels, describeOllamaModel } from './ollama.js';

const OTHER = "__other__";

/** Pick from the curated list (single source: POPULAR_MODELS), or type any id. */
async function pickModel(provider: keyof typeof POPULAR_MODELS): Promise<string> {
  const choice = await select({
    message: 'Which model would you like to use?',
    choices: [
      ...POPULAR_MODELS[provider].map(m => ({ name: m.label, value: m.value, description: m.value })),
      { name: 'Other (type a model id)', value: OTHER },
    ],
  });
  if (choice !== OTHER) return choice;
  return input({ message: 'Model id:', validate: v => v.trim().length > 0 || 'Enter a model id' });
}

export async function runOnboardingFlow(): Promise<void> {
  console.clear();
  
  // Big block ASCII logo for CRAYON (ANSI Shadow style - 1 space padded)
  const logoLines = [
    "  ██████╗ ██████╗   █████╗  ██╗   ██╗  ██████╗  ███╗   ██╗",
    " ██╔════╝ ██╔══██╗ ██╔══██╗ ╚██╗ ██╔╝ ██╔═══██╗ ████╗  ██║",
    " ██║      ██████╔╝ ███████║  ╚████╔╝  ██║   ██║ ██╔██╗ ██║",
    " ██║      ██╔══██╗ ██╔══██║   ╚██╔╝   ██║   ██║ ██║╚██╗██║",
    " ╚██████╗ ██║  ██║ ██║  ██║    ██║    ╚██████╔╝ ██║ ╚████║",
    "  ╚═════╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝    ╚═╝     ╚═════╝  ╚═╝  ╚═══╝"
  ];

  const gradientColors = ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA", "#00BCD4"];
  
  process.stdout.write("\n");
  for (let i = 0; i < logoLines.length; i++) {
    const line = logoLines[i];
    const colorHex = gradientColors[i % gradientColors.length];
    process.stdout.write(chalk.hex(colorHex).bold(line) + "\n");
    await new Promise(r => setTimeout(r, 60)); // Fast slide-down effect
  }
  process.stdout.write("\n");
  
  const subtitle = "  The Autonomous Terminal AI";
  for (const char of subtitle) {
    process.stdout.write(chalk.dim(char));
    await new Promise(r => setTimeout(r, 15)); // Subtitle typewriter
  }
  process.stdout.write("\n\n");
  
  console.log("Welcome! Let's get your environment configured.");
  console.log(chalk.dim("This will only take a moment.\n"));
  await new Promise(r => setTimeout(r, 500));

  const provider = await select({
    message: 'Which AI provider would you like to use?',
    choices: [
      { name: 'Anthropic (Recommended)', value: 'anthropic' },
      { name: 'OpenAI', value: 'openai' },
      { name: 'Google (Gemini)', value: 'google' },
      { name: 'OpenRouter', value: 'openrouter' },
      { name: 'Ollama (Local or Ollama Cloud)', value: 'ollama' },
    ],
  });

  let model = "";
  let apiKey = "";

  if (provider === "ollama") {
    console.log(chalk.cyan(`Connecting to Ollama at ${ollamaHost()}...`));
    const localModels = await fetchOllamaModels();
    if (localModels && localModels.length > 0) {
      model = await select({
        message: 'Select an installed Ollama model:',
        choices: localModels.map(m => ({ name: m.name, value: m.name, description: describeOllamaModel(m) })),
      });
    } else {
      console.log(chalk.yellow(`\n⚠️  No Ollama chat models found at ${ollamaHost()}.`));
      console.log(chalk.cyan("\nTo get one:"));
      console.log("  1. Install Ollama from " + chalk.dim("https://ollama.com") + " and start it");
      console.log("  2. Pull a coding model, local or cloud:");
      console.log(chalk.green("     ollama pull qwen3-coder:30b") + chalk.dim("          # local, ~19 GB"));
      console.log(chalk.green("     ollama signin && ollama pull qwen3-coder:480b-cloud") + chalk.dim("  # cloud, no GPU"));
      console.log(chalk.dim("  Remote server? Set OLLAMA_BASE_URL.\n"));
      model = await pickModel("ollama");
    }
  } else {
    model = await pickModel(provider);
    const envVar = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", google: "GEMINI_API_KEY", openrouter: "OPENROUTER_API_KEY" }[provider];
    apiKey = await password({
      message: `Enter your ${provider} API key ${chalk.dim(`(or leave blank and set ${envVar})`)}:`,
      mask: '*',
    });
  }

  const telemetry = await confirm({
    message: 'Allow Crayon to collect anonymous error telemetry to improve the agent?',
    default: true,
  });

  const permissionMode = await select({
    message: 'Select the default permission mode:',
    choices: [
      { name: 'Ask (Require approval for all terminal commands and file edits)', value: 'ask' },
      { name: 'Auto-Edit (Auto-approve file edits, ask for terminal commands)', value: 'auto-edit' },
      { name: 'Auto (Fully autonomous, run commands and edits automatically)', value: 'auto' },
    ],
  });

  const theme = await select({
    message: 'Select your preferred UI theme:',
    choices: [
      { name: 'Dark Mode (Default)', value: 'dark' },
      { name: 'Light Mode', value: 'light' },
      { name: 'High Contrast', value: 'high-contrast' },
    ],
  });

  const updateMode = await select({
    message: 'How should Crayon handle CLI updates?',
    choices: [
      { name: 'Prompt (Ask before updating on boot) [Default]', value: 'prompt' },
      { name: 'Auto (Silently update on boot)', value: 'auto' },
      { name: 'Notify (Passive notification on exit)', value: 'notify' },
    ],
  });

  const configPath = path.join(os.homedir(), ".crayon", "config.json");
  const configDir = path.dirname(configPath);
  
  if (!existsSync(configDir)) {
    await fs.mkdir(configDir, { recursive: true });
  }

  const configObj: any = {
    provider,
    defaultModel: model,
    telemetry,
    permissionMode,
    theme,
    updateMode,
  };

  if (provider === "anthropic") configObj.anthropicApiKey = apiKey;
  else if (provider === "openai") configObj.openaiApiKey = apiKey;
  else if (provider === "google") configObj.googleApiKey = apiKey;
  else if (provider === "openrouter") configObj.openrouterApiKey = apiKey;

  await fs.writeFile(configPath, JSON.stringify(configObj, null, 2));

  console.log(chalk.green.bold("\n✓ Configuration saved to ~/.crayon/config.json"));
  console.log(chalk.cyan("Launching Crayon...\n"));
}
