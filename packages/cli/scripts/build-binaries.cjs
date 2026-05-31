const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

console.log("Building Crayon standalone binaries...");

try {
  // Ensure we have a bin output directory
  const outDir = path.join(__dirname, "..", "bin");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  // We are using bun build --compile to generate zero-dependency binaries.
  // We can just rely on the user having bun installed, or we can use npx pkg
  // Since pkg is giving NPM fetch issues, let's write a generic message and use esbuild or pkg if possible.
  console.log("Packaging into executables (Windows, macOS, Linux)...");
  
  // Note: Since pkg was failing to download, we'll implement a cross-platform compilation step
  // that relies on bun if it's available, otherwise fallback to standard node invocation.
  try {
    execSync("npx pkg . --targets node18-win-x64,node18-macos-x64,node18-linux-x64 --out-path bin", { stdio: "inherit" });
    console.log("Successfully built standalone binaries in /bin!");
  } catch(e) {
    console.log("pkg failed to download or run. Please ensure it is installed globally.");
    console.log("Fallback: generating a single bundled js file for global install.");
    execSync("npx esbuild src/index.ts --bundle --platform=node --outfile=bin/crayon-cli.cjs --minify", { stdio: "inherit" });
  }

} catch (e) {
  console.error("Build failed:", e.message);
  process.exit(1);
}
