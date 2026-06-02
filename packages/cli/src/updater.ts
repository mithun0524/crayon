import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawn } from "node:child_process";
import https from "node:https";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { CrayonConfig } from "./config.js";
import { confirm } from "@inquirer/prompts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CACHE_DIR = path.join(os.homedir(), ".crayon");
const CACHE_FILE = path.join(CACHE_DIR, "update-cache.json");

interface UpdateCache {
  latestVersion: string;
  lastChecked: number;
}

export function spawnBackgroundUpdateCheck() {
  // Spawn a detached child process that runs the update checker script
  // We use process.argv[1] (the index.js) but pass a special flag to run just the checker
  const child = spawn(process.execPath, [process.argv[1]!, "--internal-check-update"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export async function runInternalUpdateCheck() {
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(__dirname, "../package.json"), "utf-8"));
    const currentVersion = pkgJson.version;

    // Check npm registry
    const latestVersion = await fetchLatestVersionFromNpm();
    
    if (latestVersion && latestVersion !== currentVersion) {
      if (!existsSync(CACHE_DIR)) {
        await fs.mkdir(CACHE_DIR, { recursive: true });
      }
      
      const cacheData: UpdateCache = {
        latestVersion,
        lastChecked: Date.now(),
      };
      
      await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData));
    }
  } catch (err) {
    // Silently fail in background
  }
}

async function fetchLatestVersionFromNpm(): Promise<string | null> {
  return new Promise((resolve) => {
    https.get("https://registry.npmjs.org/crayon-cli/latest", (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version || null);
        } catch {
          resolve(null);
        }
      });
    }).on("error", () => {
      resolve(null);
    });
  });
}

export async function handleUpdateOnBoot(config: CrayonConfig): Promise<void> {
  if (!existsSync(CACHE_FILE)) return;

  try {
    const cache: UpdateCache = JSON.parse(await fs.readFile(CACHE_FILE, "utf-8"));
    const pkgJson = JSON.parse(await fs.readFile(path.join(__dirname, "../package.json"), "utf-8"));
    const currentVersion = pkgJson.version;

    if (cache.latestVersion && cache.latestVersion !== currentVersion) {
      const mode = config.updateMode || "prompt";
      
      if (mode === "auto") {
        console.log(chalk.cyan(`\nAuto-updating Crayon from ${currentVersion} to ${cache.latestVersion}...`));
        try {
          execSync("npm install -g crayon-cli@latest", { stdio: "inherit" });
          await fs.unlink(CACHE_FILE);
          console.log(chalk.green("Update complete! Restarting..."));
          // Restart process
          spawn(process.argv[0], process.argv.slice(1), { stdio: "inherit", detached: true }).unref();
          process.exit(0);
        } catch (e) {
          console.error(chalk.red("Failed to auto-update. Continuing with current version."));
        }
      } else if (mode === "prompt") {
        console.log("");
        const shouldUpdate = await confirm({
          message: `A new version of Crayon is available! (${currentVersion} → ${cache.latestVersion}). Update now?`,
          default: true
        });

        if (shouldUpdate) {
          console.log(chalk.cyan("Installing update..."));
          try {
            execSync("npm install -g crayon-cli@latest", { stdio: "inherit" });
            await fs.unlink(CACHE_FILE);
            console.log(chalk.green("Update complete! Restarting..."));
            spawn(process.argv[0], process.argv.slice(1), { stdio: "inherit", detached: true }).unref();
            process.exit(0);
          } catch (e) {
            console.error(chalk.red("Failed to update. Continuing with current version."));
          }
        } else {
          // If they skip, leave it for passive notifier
          console.log(chalk.dim("Skipping update for now."));
        }
      }
    } else if (cache.latestVersion === currentVersion) {
      // Clear cache if we are already up to date (e.g. they updated manually)
      await fs.unlink(CACHE_FILE).catch(() => {});
    }
  } catch (e) {
    // Ignore cache read errors
  }
}

export async function showPassiveNotification(): Promise<void> {
  if (!existsSync(CACHE_FILE)) return;

  try {
    const cache: UpdateCache = JSON.parse(await fs.readFile(CACHE_FILE, "utf-8"));
    const pkgJson = JSON.parse(await fs.readFile(path.join(__dirname, "../package.json"), "utf-8"));
    const currentVersion = pkgJson.version;

    if (cache.latestVersion && cache.latestVersion !== currentVersion) {
      console.log("\n" + chalk.cyan("╭──────────────────────────────────────────────╮"));
      console.log(chalk.cyan("│                                              │"));
      console.log(chalk.cyan("│") + `   Update available! ${chalk.dim(currentVersion)} → ${chalk.green(cache.latestVersion)}`.padEnd(52) + chalk.cyan("│"));
      console.log(chalk.cyan("│") + `   Run: ${chalk.cyanBright("npm i -g crayon-cli@latest")}`.padEnd(52) + chalk.cyan("│"));
      console.log(chalk.cyan("│                                              │"));
      console.log(chalk.cyan("╰──────────────────────────────────────────────╯") + "\n");
    }
  } catch (e) {
    // Ignore errors on exit
  }
}
