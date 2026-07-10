#!/usr/bin/env node
/**
 * Called by semantic-release's prepareCmd with the next version as argv[2].
 * Keeps every package on the same version — the three npm packages plus the
 * VS Code extension (which ships as a .vsix release asset, not to npm, but
 * should still track the suite version instead of drifting).
 */
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("Usage: bump-version.mjs <version>");
  process.exit(1);
}

const packages = [
  "packages/cli/package.json",
  "packages/agent/package.json",
  "packages/indexer/package.json",
  "packages/vscode/package.json",
];

for (const pkgPath of packages) {
  const json = JSON.parse(readFileSync(pkgPath, "utf-8"));
  json.version = version;
  writeFileSync(pkgPath, JSON.stringify(json, null, 2) + "\n");
  console.log(`✓ ${pkgPath} → ${version}`);
}
