import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { RepoIntelligence } from "./types.js";

export async function detectRepoIntelligence(workspaceRoot: string): Promise<RepoIntelligence> {
  const intel: RepoIntelligence = {};

  const pkgPath = path.join(workspaceRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      intel.dependencies = Object.keys(allDeps);

      if (allDeps["next"]) intel.framework = "Next.js";
      else if (allDeps["nuxt"]) intel.framework = "Nuxt";
      else if (allDeps["@remix-run/react"]) intel.framework = "Remix";
      else if (allDeps["react"]) intel.framework = "React";
      else if (allDeps["vue"]) intel.framework = "Vue";
      else if (allDeps["svelte"]) intel.framework = "Svelte";
      else if (allDeps["express"]) intel.framework = "Express";
      else if (allDeps["fastify"]) intel.framework = "Fastify";

      if (allDeps["typescript"]) intel.language = "TypeScript";
      else if (allDeps["@types/node"]) intel.language = "TypeScript";

      if (allDeps["vitest"]) intel.testRunner = "vitest";
      else if (allDeps["jest"]) intel.testRunner = "jest";
      else if (allDeps["mocha"]) intel.testRunner = "mocha";

      if (existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) intel.packageManager = "pnpm";
      else if (existsSync(path.join(workspaceRoot, "yarn.lock"))) intel.packageManager = "yarn";
      else if (existsSync(path.join(workspaceRoot, "package-lock.json"))) intel.packageManager = "npm";
    } catch {
      // ignore parse errors
    }
  }

  if (existsSync(path.join(workspaceRoot, "tsconfig.json")) && !intel.language) {
    intel.language = "TypeScript";
  }

  if (existsSync(path.join(workspaceRoot, "Cargo.toml"))) {
    intel.language = "Rust";
    intel.packageManager = "cargo";
  }

  if (existsSync(path.join(workspaceRoot, "pyproject.toml")) || existsSync(path.join(workspaceRoot, "requirements.txt"))) {
    intel.language = "Python";
  }

  if (existsSync(path.join(workspaceRoot, "go.mod"))) {
    intel.language = "Go";
    intel.packageManager = "go";
  }

  return intel;
}
