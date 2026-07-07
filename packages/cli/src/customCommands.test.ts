import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadCustomCommands, expandTemplate } from "./customCommands.js";

describe("custom commands", () => {
  let ws: string;
  let home: string;

  beforeEach(async () => {
    ws = await mkdtemp(path.join(os.tmpdir(), "cc-ws-"));
    home = await mkdtemp(path.join(os.tmpdir(), "cc-home-"));
    await mkdir(path.join(ws, ".crayon", "commands"), { recursive: true });
    await mkdir(path.join(home, ".crayon", "commands"), { recursive: true });
  });

  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  it("loads workspace + global commands; workspace shadows global", async () => {
    await writeFile(path.join(ws, ".crayon", "commands", "review.md"), "# Review\nworkspace body");
    await writeFile(path.join(home, ".crayon", "commands", "review.md"), "# Review\nglobal body");
    await writeFile(path.join(home, ".crayon", "commands", "standup.md"), "# Standup\nsummarize");

    const cmds = await loadCustomCommands(ws, home);
    expect(cmds.map((c) => c.cmd).sort()).toEqual(["/review", "/standup"]);
    expect(cmds.find((c) => c.cmd === "/review")!.template).toContain("workspace body");
  });

  it("skips empty and non-markdown files, sanitizes names", async () => {
    await writeFile(path.join(ws, ".crayon", "commands", "empty.md"), "");
    await writeFile(path.join(ws, ".crayon", "commands", "notes.txt"), "nope");
    await writeFile(path.join(ws, ".crayon", "commands", "We!rd Name.md"), "# odd\nbody");

    const cmds = await loadCustomCommands(ws, home);
    expect(cmds.map((c) => c.cmd)).toEqual(["/werdname"]);
  });

  it("returns [] when no commands dirs exist", async () => {
    const bare = await mkdtemp(path.join(os.tmpdir(), "cc-bare-"));
    expect(await loadCustomCommands(bare, bare)).toEqual([]);
    await rm(bare, { recursive: true, force: true });
  });

  it("expandTemplate replaces $ARGUMENTS (all occurrences)", () => {
    expect(expandTemplate("a $ARGUMENTS b $ARGUMENTS", "X")).toBe("a X b X");
  });

  it("expandTemplate appends args when no placeholder; no-op when no args", () => {
    expect(expandTemplate("fixed", "ctx")).toBe("fixed\n\nctx");
    expect(expandTemplate("fixed", "")).toBe("fixed");
  });
});
