import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

const isWatch = process.argv.includes("--watch");

const nativeModules = [
  "ts-morph",
  "typescript",
  "@lancedb/lancedb",
  "@vscode/ripgrep",
  "web-tree-sitter",
  "tree-sitter-wasms",
  "fsevents",
  "react-devtools-core"
];

const config = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/index.js",
  external: nativeModules,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: false,
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`
  }
};

async function build() {
  mkdirSync("dist", { recursive: true });

  if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(config);
    console.log("CLI built successfully via esbuild");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
