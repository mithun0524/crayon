import { select, input, password, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';

export async function runOnboardingFlow(): Promise<void> {
  console.clear();
  
  // Big block ASCII logo for CRAYON (ANSI Shadow style)
  const logoLines = [
    "  ██████╗██████╗  █████╗ ██╗   ██╗ ██████╗ ███╗   ██╗",
    " ██╔════╝██╔══██╗██╔══██╗╚██╗ ██╔╝██╔═══██╗████╗  ██║",
    " ██║     ██████╔╝███████║ ╚████╔╝ ██║   ██║██╔██╗ ██║",
    " ██║     ██╔══██╗██╔══██║  ╚██╔╝  ██║   ██║██║╚██╗██║",
    " ╚██████╗██║  ██║██║  ██║   ██║   ╚██████╔╝██║ ╚████║",
    "  ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═══╝"
  ];

  const gradientColors = ["#FF6B6B", "#FF9E79", "#FFD93D", "#6BCB77", "#4D96FF", "#9D4EDD"];
  
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
    ],
  });

  let defaultModel = "";
  if (provider === "anthropic") defaultModel = "claude-3-7-sonnet-latest";
  else if (provider === "openai") defaultModel = "gpt-4o";
  else if (provider === "google") defaultModel = "gemini-2.5-pro";
  else if (provider === "openrouter") defaultModel = "anthropic/claude-3.7-sonnet";

  const model = await input({
    message: 'Which model would you like to use?',
    default: defaultModel,
  });

  const apiKey = await password({
    message: `Enter your ${provider} API Key:`,
    mask: '*',
  });

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
