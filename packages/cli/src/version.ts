import { readFileSync } from "node:fs";

// Resolves to crayon-cli's package.json both from src/ (tsx/vitest) and from the
// single-file bundle at dist/index.js — each sits one level below the package root.
function readVersion(): string {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const CRAYON_VERSION = readVersion();
