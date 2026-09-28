// The npm page shows packages/cli/README.md. Generate it from the repo README
// (the one source of truth) so the two can't drift; runs on prepack.
import { readFileSync, writeFileSync } from "node:fs";

const RAW = "https://raw.githubusercontent.com/mithun0524/crayon/main/";
const BLOB = "https://github.com/mithun0524/crayon/blob/main/";

const src = readFileSync(new URL("../../../README.md", import.meta.url), "utf-8");
// npm can't resolve repo-relative paths: images -> raw URLs, links -> blob URLs.
const out = src
  .replace(/(src|href)="\.\/([^"]+)"/g, (_, attr, p) => `${attr}="${attr === "src" ? RAW : BLOB}${p}"`)
  .replace(/\]\(\.\/([^)]+)\)/g, (_, p) => `](${BLOB}${p})`);

writeFileSync(new URL("../README.md", import.meta.url), `<!-- Generated from the repo README by scripts/sync-readme.mjs — edit ../../README.md instead. -->\n${out}`);
