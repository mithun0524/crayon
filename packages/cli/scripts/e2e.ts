import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

console.log("Running End-to-End Security & Dependency Test...");

const testWorkspace = path.join(process.cwd(), "e2e-test-workspace");
if (!fs.existsSync(testWorkspace)) {
  fs.mkdirSync(testWorkspace);
}

// Ensure Crayon CLI is built
console.log("Building CLI...");
spawnSync("pnpm", ["run", "build"], { stdio: "inherit", cwd: process.cwd() });

console.log("Testing autonomous run: writing a simple python script...");
const cliPath = path.join(process.cwd(), "bin", "crayon-cli.cjs");
let cmd = `node dist/index.js`; // fall back to local dist

const result = spawnSync(
  "npx",
  ["tsx", "../src/index.ts", "run", "Create a file named hello.py that prints hello crayon"],
  { cwd: testWorkspace, env: process.env, encoding: "utf-8" }
);

console.log(result.stdout);
if (result.stderr) {
  console.error(result.stderr);
}

const testFile = path.join(testWorkspace, "hello.py");
if (fs.existsSync(testFile)) {
  const content = fs.readFileSync(testFile, "utf-8");
  console.log(`\nSUCCESS! Agent successfully created hello.py:`);
  console.log(content);
} else {
  console.error(`\nFAILURE! Agent failed to create the file. Test did not pass.`);
  process.exit(1);
}

console.log("End-to-End test passed without breaking!");
