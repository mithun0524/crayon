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
  "pg-query-stream",
  "@lancedb/lancedb",
  "web-tree-sitter",
  "tree-sitter-wasms"
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

const webviewConfig = {
  entryPoints: ["src/webview/main.ts"],
  bundle: true,
  outfile: "dist/webview.js",
  format: "iife",
  platform: "browser",
  sourcemap: true,
  minify: true,
};

async function build() {
  mkdirSync("dist", { recursive: true });

  if (isWatch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    await ctxExt.watch();
    await ctxWeb.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(extensionConfig);
    await esbuild.build(webviewConfig);
    console.log("Extension built successfully");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
