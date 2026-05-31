import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");

console.log("Running Crayon smoke test...");

try {
  console.log("Building workspace...");
  execSync("pnpm -r run build", { stdio: "inherit", cwd: rootDir });

  console.log("\nRunning CLI basic task...");
  const cliBin = resolve(rootDir, "packages/cli/dist/index.js");
  
  // Running in the scripts directory so we don't pollute root
  // We run a simple task that writes a file
  execSync(`node "${cliBin}" run "Write a file named smoke.txt containing 'smoke test ok' in the current directory"`, {
    stdio: "inherit",
    cwd: __dirname,
    env: { ...process.env, CI: "true" } // Try to simulate non-TTY if not already
  });

  console.log("Checking if file was created...");
  const smokeTxtPath = resolve(__dirname, "smoke.txt");
  if (fs.existsSync(smokeTxtPath)) {
    const content = fs.readFileSync(smokeTxtPath, "utf-8");
    if (content.includes("smoke test ok")) {
      console.log("Smoke test passed! File created successfully.");
      fs.unlinkSync(smokeTxtPath); // Cleanup
    } else {
      console.error(`Smoke test failed: unexpected content in smoke.txt: ${content}`);
      process.exit(1);
    }
  } else {
    console.error("Smoke test failed: smoke.txt was not created.");
    process.exit(1);
  }
} catch (err) {
  console.error("Smoke test failed!", err);
  process.exit(1);
}
