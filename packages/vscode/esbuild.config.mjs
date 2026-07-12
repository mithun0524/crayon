import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

const isWatch = process.argv.includes("--watch");

// Everything pure-JS (ai, ts-morph, simple-git, crayon-agent/indexer, …) is
// bundled INTO dist/extension.js so the VSIX is self-contained. Only these
// stay external and must therefore exist in node_modules at runtime — they
// are shipped inside the VSIX by scripts/package.cjs:
const runtimeExternals = [
  "vscode",
  "@vscode/ripgrep", // native binary
  "node-pty", // native pty.node — must resolve at runtime, not be bundled
  "@lancedb/lancedb", // native .node addon
  "web-tree-sitter", // loads its own .wasm
  "tree-sitter-wasms", // .wasm grammars resolved via require.resolve
  // Bundling @ai-sdk/google makes Gemini calls hang/retry for tens of seconds
  // (same issue documented in packages/cli/esbuild.config.mjs) — keep external.
  "@ai-sdk/google",
];

// Optional drivers referenced behind feature checks by transitive deps. They
// are not installed anywhere in the workspace, so the requires never execute;
// marking them external just stops esbuild from failing resolution.
const phantomExternals = [
  "sql.js",
  "better-sqlite3",
  "pg",
  "mysql2",
  "mariadb",
  "tedious",
  "pg-query-stream",
  "fsevents",
];

const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: [...runtimeExternals, ...phantomExternals],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: false,
  // crayon-indexer does createRequire(import.meta.url) to resolve .wasm files;
  // import.meta is empty in a CJS bundle, so substitute the real file URL.
  define: { "import.meta.url": "__cjs_import_meta_url" },
  banner: {
    js: 'const __cjs_import_meta_url = require("node:url").pathToFileURL(__filename).href;',
  },
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
