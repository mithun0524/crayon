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
  "fsevents"
];

// ink imports react-devtools-core only when DEV=true. It is not a runtime
// dependency, so bundling it as external left an unresolvable top-level import
// that crashed the CLI on boot. Stub it to an empty module instead.
const stubDevtoolsPlugin = {
  name: "stub-react-devtools-core",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: "react-devtools-core",
      namespace: "stub-devtools",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub-devtools" }, () => ({
      contents: "const devtools = { connectToDevTools() {} }; export default devtools; export function connectToDevTools() {}",
      loader: "js",
    }));
  },
};

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
  plugins: [stubDevtoolsPlugin],
  banner: {
    // Alias the import: a bundled dependency also does `import { createRequire }
    // from "node:module"`, which esbuild hoists to top level. Using the bare name
    // here would declare `createRequire` twice → "already been declared" SyntaxError.
    js: `import { createRequire as __crayonCreateRequire } from 'module'; const require = __crayonCreateRequire(import.meta.url);`
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
