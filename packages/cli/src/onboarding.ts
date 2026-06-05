import { select, input, password, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';

async function fetchOllamaModels(): Promise<string[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2 second timeout
    const res = await fetch("http://localhost:11434/api/tags", { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as { models?: { name: string }[] };
    if (data.models && data.models.length > 0) {
      return data.models.map(m => m.name);
    }
  } catch {}
  return null;
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
      { name: 'Ollama (100% Local & Free)', value: 'ollama' },
    ],
  });

  let model = "";
  let apiKey = "";

  if (provider === "ollama") {
    console.log(chalk.cyan("Connecting to local Ollama service..."));
    const localModels = await fetchOllamaModels();
    if (localModels && localModels.length > 0) {
      model = await select({
        message: 'Select an installed Ollama model:',
        choices: localModels.map(m => ({ name: m, value: m })),
      });
    } else {
      console.log(chalk.yellow("\n⚠️ Could not detect running Ollama service or no models found on http://localhost:11434."));
      console.log(chalk.dim("Make sure Ollama is running and you have pulled a model via `ollama run qwen2.5-coder`.\n"));
      model = await input({
        message: 'Enter the name of the Ollama model you wish to use:',
        default: 'qwen2.5-coder:7b',
      });
    }
  } else {
    let defaultModel = "";
    if (provider === "anthropic") defaultModel = "claude-3-7-sonnet-latest";
    else if (provider === "openai") defaultModel = "gpt-4o";
    else if (provider === "google") defaultModel = "gemini-2.5-pro";
    else if (provider === "openrouter") defaultModel = "anthropic/claude-3.7-sonnet";

    model = await input({
      message: 'Which model would you like to use?',
      default: defaultModel,
    });

    apiKey = await password({
      message: `Enter your ${provider} API Key:`,
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
