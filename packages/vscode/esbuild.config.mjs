import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

const isWatch = process.argv.includes("--watch");

const nativeModules = [
  "vscode",
  "ai",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai",
  "@modelcontextprotocol/sdk",
  "diff",
  "fast-glob",
  "simple-git",
  "ts-morph",
  "zod",
  "@vscode/ripgrep",
  "chokidar",
  "sql.js", 
  "better-sqlite3",
  "pg",
  "mysql2",
  "mariadb",
  "tedious",
  "pg-query-stream"
];

const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: nativeModules,
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: false,
};

async function build() {
  mkdirSync("dist", { recursive: true });

  if (isWatch) {
    const ctx = await esbuild.context(extensionConfig);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(extensionConfig);
    console.log("Extension built successfully");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
