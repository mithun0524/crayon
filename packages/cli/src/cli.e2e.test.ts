import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { spawn as ptySpawn, type IPty } from "@lydell/node-pty";
import { mkdtemp, rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/index.js");
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b[=>]/g, "");

/** Drives the real built CLI inside a pseudo-terminal. */
class CliSession {
  pty: IPty;
  buf = "";
  exitCode: number | null = null;
  constructor(cwd: string, args: string[] = ["chat"]) {
    this.pty = ptySpawn(process.execPath, [DIST, ...args], {
      name: "xterm-color", cols: 120, rows: 40, cwd,
      env: { ...process.env, CRAYON_PROVIDER: "ollama", CRAYON_MODEL: "ollama/llama3.1:8b", CRAYON_DISABLE_TELEMETRY: "1" },
    });
    this.pty.onData((d) => { this.buf += d; });
    this.pty.onExit(({ exitCode }) => { this.exitCode = exitCode; });
  }
  get text() { return strip(this.buf); }
  write(s: string) { this.pty.write(s); }
  /** Type text, then send Enter separately — a single chunk with a trailing CR
   *  isn't submitted by ink-text-input (only matters for automated input). */
  async submit(s: string) {
    this.pty.write(s);
    await new Promise((r) => setTimeout(r, 250));
    this.pty.write("\r");
  }
  async waitFor(sub: string, ms = 8000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (this.text.includes(sub)) return;
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error(`Timed out waiting for ${JSON.stringify(sub)}.\n--- got ---\n${this.text.slice(-1500)}`);
  }
  async waitExit(ms = 5000): Promise<number> {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (this.exitCode !== null) return this.exitCode;
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error("process did not exit in time");
  }
  kill() { try { this.pty.kill(); } catch { /* already dead */ } }
}

describe("CLI e2e (real binary in a PTY)", () => {
  let cwd: string;
  let sess: CliSession | null = null;

  beforeAll(() => {
    if (!existsSync(DIST)) throw new Error(`Build first: ${DIST} missing`);
  });

  afterEach(async () => {
    if (sess) { sess.kill(); sess = null; }
    if (cwd) await rm(cwd, { recursive: true, force: true }).catch(() => {});
  });

  async function freshRepo() {
    cwd = await mkdtemp(path.join(os.tmpdir(), "crayon-e2e-"));
    execSync("git init -q && git config user.email t@t.t && git config user.name t", { cwd });
    return cwd;
  }

  it("boots: renders the gradient logo, tagline, prompt, and status bar", async () => {
    sess = new CliSession(await freshRepo());
    await sess.waitFor("Autonomous Terminal AI", 10000);
    await sess.waitFor("crayon ❯");
    await sess.waitFor("ask mode on");
  }, 20000);

  it("/help lists commands", async () => {
    sess = new CliSession(await freshRepo());
    await sess.waitFor("crayon ❯", 10000);
    await sess.submit("/help");
    await sess.waitFor("Available Commands");
    await sess.waitFor("Clear conversation history");
    await sess.waitFor("/model");
  }, 20000);

  it("typing '/' opens the inline command menu that filters", async () => {
    sess = new CliSession(await freshRepo());
    await sess.waitFor("crayon ❯", 10000);
    sess.write("/co");
    // "/co" matches /cost /compact /config /color; the 3-row window shows the
    // first three, so assert visible ones + the footer.
    await sess.waitFor("/cost");
    await sess.waitFor("/compact");
    await sess.waitFor("select"); // footer: "↑↓ select · ⏎ run · …"
  }, 20000);

  it("Ctrl+T cycles the permission mode", async () => {
    sess = new CliSession(await freshRepo());
    await sess.waitFor("ask mode on", 10000);
    sess.write("\x14"); // Ctrl+T
    await sess.waitFor("auto-edit mode on");
  }, 20000);

  it("double Ctrl+C exits cleanly (interrupt-first, then quit)", async () => {
    sess = new CliSession(await freshRepo());
    await sess.waitFor("crayon ❯", 10000);
    sess.write("\x03");
    await sess.waitFor("Press Ctrl+C again to exit");
    sess.write("\x03");
    expect(await sess.waitExit()).toBe(0);
  }, 20000);
});
