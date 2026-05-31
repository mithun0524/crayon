import { select, input, password, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';

export async function runOnboardingFlow(): Promise<void> {
  console.log(chalk.cyan.bold("\nWelcome to Crayon! The Autonomous Terminal AI."));
  console.log(chalk.gray("Let's get your environment set up.\n"));

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

  const configPath = path.join(os.homedir(), ".crayon", "config.json");
  const configDir = path.dirname(configPath);
  
  if (!existsSync(configDir)) {
    await fs.mkdir(configDir, { recursive: true });
  }

  const configObj: any = {
    provider,
    defaultModel: model,
    telemetry,
  };

  if (provider === "anthropic") configObj.anthropicApiKey = apiKey;
  else if (provider === "openai") configObj.openaiApiKey = apiKey;
  else if (provider === "google") configObj.googleApiKey = apiKey;
  else if (provider === "openrouter") configObj.openrouterApiKey = apiKey;

  await fs.writeFile(configPath, JSON.stringify(configObj, null, 2));

  console.log(chalk.green.bold("\n✓ Configuration saved to ~/.crayon/config.json"));
  console.log(chalk.cyan("Launching Crayon...\n"));
}
