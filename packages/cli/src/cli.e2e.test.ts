import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { spawn as ptySpawn, type IPty } from "@lydell/node-pty";
import { mkdtemp, rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
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
  constructor(cwd: string, args: string[] = ["chat"], extraEnv: Record<string, string> = {}) {
    // Ink (via ci-info) drops to NON-interactive rendering when $CI is set,
    // so the dynamic `crayon ❯` prompt never flushes. We drive a REAL pty
    // here and are explicitly testing interactive behavior, so strip CI (and
    // related CI flags) from the child's env.
    const { CI, CONTINUOUS_INTEGRATION, GITHUB_ACTIONS, BUILD_NUMBER, RUN_ID, ...cleanEnv } = process.env;
    this.pty = ptySpawn(process.execPath, [DIST, ...args], {
      name: "xterm-color", cols: 120, rows: 40, cwd,
      env: { ...cleanEnv, CRAYON_PROVIDER: "ollama", CRAYON_MODEL: "ollama/llama3.1:8b", CRAYON_DISABLE_TELEMETRY: "1", ...extraEnv },
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
  /** Wait for the prompt, then let the input settle (focus/raw-mode) before typing. */
  async ready(): Promise<void> {
    await this.waitFor("crayon ❯", 12000);
    await new Promise((r) => setTimeout(r, 500));
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
    await sess.ready();
    await sess.submit("/help");
    await sess.waitFor("Available Commands");
    await sess.waitFor("Clear conversation history");
    await sess.waitFor("/model");
  }, 20000);

  it("typing '/' opens the inline command menu that filters", async () => {
    sess = new CliSession(await freshRepo());
    await sess.ready();
    sess.write("/co");
    // "/co" matches /cost /compact /config /color; the 3-row window shows the
    // first three, so assert visible ones + the footer.
    await sess.waitFor("/cost");
    await sess.waitFor("/compact");
    await sess.waitFor("select"); // footer: "↑↓ select · ⏎ run · …"
  }, 20000);

  it("Ctrl+T cycles the permission mode", async () => {
    // Force a known starting mode — otherwise it inherits the user's config.
    sess = new CliSession(await freshRepo(), ["chat", "--mode", "ask"]);
    await sess.ready();
    await sess.waitFor("ask mode on");
    sess.write("\x14"); // Ctrl+T → ask → auto-edit
    await sess.waitFor("auto-edit mode on");
  }, 20000);

  it("'?' opens the keyboard-shortcuts help overlay", async () => {
    sess = new CliSession(await freshRepo());
    await sess.ready();
    sess.write("?");
    await sess.waitFor("Keyboard shortcuts");
    await sess.waitFor("recall previous prompts");
    await sess.waitFor("Commands");
  }, 20000);

  it("/theme opens the theme picker", async () => {
    sess = new CliSession(await freshRepo());
    await sess.ready();
    await sess.submit("/theme");
    await sess.waitFor("ui theme");
    await sess.waitFor("High Contrast");
  }, 20000);

  it("/theme <name> switches the theme and persists it", async () => {
    // Isolate HOME so the switch writes to a throwaway ~/.crayon, not the user's.
    const home = await mkdtemp(path.join(os.tmpdir(), "crayon-home-"));
    try {
      sess = new CliSession(await freshRepo(), ["chat"], { HOME: home, USERPROFILE: home });
      await sess.ready();
      await sess.submit("/theme light");
      await sess.waitFor("Theme changed to Light");
    } finally {
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
  }, 20000);

  it("/copy reports when there is nothing to copy", async () => {
    sess = new CliSession(await freshRepo());
    await sess.ready();
    await sess.submit("/copy");
    await sess.waitFor("Nothing to copy yet");
  }, 20000);

  it("typing '@' opens the file-mention autocomplete", async () => {
    const dir = await freshRepo();
    writeFileSync(path.join(dir, "hello.ts"), "export const x = 1;\n");
    execSync("git add hello.ts", { cwd: dir });
    sess = new CliSession(dir);
    await sess.ready();
    sess.write("@hel");
    await sess.waitFor("@hello.ts");
    await sess.waitFor("tab complete");
  }, 20000);

  it("Tab completes an '@' mention into the input", async () => {
    const dir = await freshRepo();
    writeFileSync(path.join(dir, "hello.ts"), "export const x = 1;\n");
    execSync("git add hello.ts", { cwd: dir });
    sess = new CliSession(dir);
    await sess.ready();
    sess.write("@hel");
    await sess.waitFor("tab complete"); // menu is open
    sess.write("\t");                   // complete the highlighted path
    await new Promise((r) => setTimeout(r, 400)); // let the completion state flush
    sess.write("done");                 // keep typing after the inserted "@hello.ts "
    // Only reachable if Tab inserted the full "@hello.ts " token before "done".
    await sess.waitFor("@hello.ts done");
  }, 20000);

  it("/theme picker applies the selected theme on Enter", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "crayon-home-"));
    try {
      sess = new CliSession(await freshRepo(), ["chat"], { HOME: home, USERPROFILE: home });
      await sess.ready();
      await sess.submit("/theme");
      await sess.waitFor("ui theme"); // picker open, "Dark" highlighted first
      sess.write("\r");               // select the highlighted theme
      await sess.waitFor("Theme changed to Dark");
    } finally {
      await rm(home, { recursive: true, force: true }).catch(() => {});
    }
  }, 20000);

  it("/resume loads the selected session's transcript on Enter", async () => {
    const dir = await freshRepo();
    const sdir = path.join(dir, ".crayon", "sessions");
    mkdirSync(sdir, { recursive: true });
    writeFileSync(
      path.join(sdir, "ZZ990011.json"),
      JSON.stringify({
        id: "ZZ990011",
        timestamp: "2026-07-02T00:00:00.000Z",
        title: "Add retry logic",
        history: [],
        chatLog: [
          { sender: "user", text: "Add retry logic" },
          { sender: "crayon", text: "RETRIED_OK_MARKER done." },
        ],
      }),
    );
    sess = new CliSession(dir);
    await sess.ready();
    await sess.submit("/resume");
    await sess.waitFor("Resume session");
    sess.write("\r"); // resume the highlighted session
    // Confirmation line + the restored assistant message (unique marker) prove
    // the transcript was actually loaded, not just listed.
    await sess.waitFor("Resumed session ZZ990011");
    await sess.waitFor("RETRIED_OK_MARKER");
  }, 20000);

  it("/resume reports when there are no saved sessions", async () => {
    sess = new CliSession(await freshRepo());
    await sess.ready();
    await sess.submit("/resume");
    await sess.waitFor("No saved sessions");
  }, 20000);

  it("/resume lists saved sessions in a picker", async () => {
    const dir = await freshRepo();
    const sdir = path.join(dir, ".crayon", "sessions");
    mkdirSync(sdir, { recursive: true });
    writeFileSync(
      path.join(sdir, "ABCD1234.json"),
      JSON.stringify({
        id: "ABCD1234",
        timestamp: "2026-07-01T00:00:00.000Z",
        title: "Fix the parser",
        history: [],
        chatLog: [{ sender: "user", text: "Fix the parser" }],
      }),
    );
    sess = new CliSession(dir);
    await sess.ready();
    await sess.submit("/resume");
    await sess.waitFor("Resume session");
    await sess.waitFor("Fix the parser");
  }, 20000);

  it("/tui fullscreen enters the alternate screen and /tui default restores it", async () => {
    sess = new CliSession(await freshRepo());
    await sess.ready();
    await sess.submit("/tui fullscreen");
    await sess.waitFor("Fullscreen renderer on");
    expect(sess.buf.includes("\x1b[?1049h")).toBe(true); // entered alt buffer
    await sess.submit("/tui default");
    await sess.waitFor("Default renderer on");
    expect(sess.buf.includes("\x1b[?1049l")).toBe(true); // restored normal buffer
  }, 20000);

  it("/img emits the iTerm2 inline-image protocol when supported", async () => {
    const dir = await freshRepo();
    writeFileSync(path.join(dir, "pic.png"), Buffer.from("fake-png-bytes"));
    sess = new CliSession(dir, ["chat"], { TERM_PROGRAM: "iTerm.app" });
    await sess.ready();
    await sess.submit("/img pic.png");
    await sess.waitFor("KB)"); // status line printed only after the command runs
    expect(sess.buf.includes("\x1b]1337;File=inline=1")).toBe(true);
  }, 20000);

  it("/img falls back gracefully on an unsupported terminal", async () => {
    const dir = await freshRepo();
    writeFileSync(path.join(dir, "pic.png"), Buffer.from("fake-png-bytes"));
    sess = new CliSession(dir, ["chat"], { TERM_PROGRAM: "xterm", LC_TERMINAL: "" });
    await sess.ready();
    await sess.submit("/img pic.png");
    await sess.waitFor("Inline images need iTerm2");
    expect(sess.buf.includes("\x1b]1337;File=")).toBe(false);
  }, 20000);

  it("double Ctrl+C exits cleanly (interrupt-first, then quit)", async () => {
    sess = new CliSession(await freshRepo());
    await sess.ready();
    sess.write("\x03");
    await sess.waitFor("Press Ctrl+C again to exit");
    sess.write("\x03");
    expect(await sess.waitExit()).toBe(0);
  }, 20000);
});
