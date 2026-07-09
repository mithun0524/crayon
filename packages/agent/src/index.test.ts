import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentEvent } from "./types.js";
import {
  scriptedModel,
  textPart,
  toolCallPart,
  finishPart,
  reasoningPart,
} from "./test/mockModel.js";

// ── Mock the model router so run() drives our scripted model ──────────
const h = vi.hoisted(() => ({ model: null as any }));
vi.mock("./models/router.js", () => ({
  getExecutionModel: () => h.model,
  getPlanningModel: () => h.model,
  getCompactModel: () => h.model,
  resolveModel: () => h.model,
}));

// ── Mock the evaluator so the self-heal loop is controllable ──────────
const ev = vi.hoisted(() => ({ queue: [] as any[] }));
vi.mock("./evaluator/check.js", () => ({
  runEvaluation: async () => (ev.queue.length ? ev.queue.shift() : null),
}));

// ── Stub createPlan (keep classifyTask real) so planning doesn't consume
// scripted model turns; tests opt into a plan via pl.steps. ─────────────
const pl = vi.hoisted(() => ({ steps: [] as string[] }));
vi.mock("./planner/plan.js", async (orig) => {
  const actual = await orig<typeof import("./planner/plan.js")>();
  return { ...actual, createPlan: async () => pl.steps };
});

// ── Mock the heavy indexer (no tree-sitter / LanceDB in unit tests) ───
vi.mock("crayon-indexer", () => {
  class CodeIndexer {
    constructor(public root: string) {}
    async init() {}
    async index() {
      return { fileCount: 0, symbolCount: 0, lastIndexed: "" };
    }
    async detectIntelligence() {
      return { language: "TypeScript", packageManager: "pnpm" };
    }
    async getIntelligence() {
      return { language: "TypeScript", packageManager: "pnpm" };
    }
    async search() {
      return [];
    }
    getFileSymbols() {
      return undefined;
    }
    getGraph() {
      return {
        getDependents: () => [],
        getDependencies: () => [],
        getImpactedFiles: () => [],
      };
    }
    getAllFiles() {
      return new Map();
    }
    close() {}
  }
  return { CodeIndexer };
});

// Imported AFTER mocks are declared (vi.mock is hoisted above imports).
const { CrayonAgent } = await import("./index.js");

function makeAgent(root: string, events: AgentEvent[], overrides = {}) {
  return new CrayonAgent({
    workspaceRoot: root,
    model: "mock-model",
    provider: "anthropic",
    anthropicApiKey: "test",
    permissionMode: "bypass",
    onEvent: (e) => events.push(e),
    maxEvalRetries: 2,
    ...overrides,
  });
}

describe("CrayonAgent.run() — core loop", () => {
  let root: string;
  let events: AgentEvent[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "crayon-loop-"));
    events = [];
    ev.queue = [];
    pl.steps = [];
    h.model = null;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const types = () => events.map((e) => e.type);
  const textOf = () =>
    events
      .filter((e) => e.type === "text" || e.type === "text_delta")
      .map((e) => (e as any).content)
      .join("");

  it("chat: streams a text reply and finishes", async () => {
    h.model = scriptedModel([[textPart("Hey! What are we building?"), finishPart("stop")]]).model;
    const agent = makeAgent(root, events);
    const result = await agent.run("hey");
    agent.close();

    expect(textOf()).toContain("Hey!");
    expect(result.success).toBe(true);
    expect(types()).toContain("text");
  });

  it("advisory: executes a read_file tool call, then answers", async () => {
    writeFileSync(path.join(root, "a.ts"), "export const x = 1;\n");
    h.model = scriptedModel([
      [toolCallPart("read_file", { path: "a.ts" }), finishPart("tool-calls")],
      [textPart("a.ts exports a constant x."), finishPart("stop")],
    ]).model;
    const agent = makeAgent(root, events);
    const result = await agent.run("what does a.ts do");
    agent.close();

    const toolCalls = events.filter((e) => e.type === "tool_call") as any[];
    expect(toolCalls.some((e) => e.name === "read_file")).toBe(true);
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
    expect(textOf()).toContain("constant x");
    expect(result.success).toBe(true);
  });

  it("coding: applies an edit and runs verification (pass)", async () => {
    ev.queue = [{ passed: true, command: "test", exitCode: 0, stdout: "ok", stderr: "" }];
    h.model = scriptedModel([
      [toolCallPart("write_file", { path: "new.ts", content: "export const y = 2;\n" }), finishPart("tool-calls")],
      [textPart("Created new.ts."), finishPart("stop")],
    ]).model;
    const agent = makeAgent(root, events);
    const result = await agent.run("create new.ts with a constant");
    agent.close();

    expect(existsSync(path.join(root, "new.ts"))).toBe(true);
    const evalEvents = events.filter((e) => e.type === "eval") as any[];
    expect(evalEvents.length).toBeGreaterThanOrEqual(1);
    expect(evalEvents.at(-1)!.passed).toBe(true);
    expect(result.success).toBe(true);
  });

  it("coding: emits a plan event and grounds the run with it", async () => {
    pl.steps = ["Create config.ts", "Wire it into index", "Add a test"];
    ev.queue = [{ passed: true, command: "test", exitCode: 0, stdout: "ok", stderr: "" }];
    h.model = scriptedModel([
      [toolCallPart("write_file", { path: "config.ts", content: "export const c = {};\n" }), finishPart("tool-calls")],
      [textPart("Added config.ts."), finishPart("stop")],
    ]).model;
    const agent = makeAgent(root, events);
    const result = await agent.run("implement a config module");
    agent.close();

    const planEvents = events.filter((e) => e.type === "plan") as any[];
    expect(planEvents.length).toBe(1);
    expect(planEvents[0].steps).toEqual(["Create config.ts", "Wire it into index", "Add a test"]);
    expect(result.success).toBe(true);
  });

  it("coding: retries on failed verification, then passes", async () => {
    // fail once, pass on retry
    ev.queue = [
      { passed: false, command: "test", exitCode: 1, stdout: "", stderr: "boom" },
      { passed: true, command: "test", exitCode: 0, stdout: "ok", stderr: "" },
    ];
    h.model = scriptedModel([
      [toolCallPart("write_file", { path: "f.ts", content: "bad\n" }), finishPart("tool-calls")],
      [textPart("wrote f.ts"), finishPart("stop")],
      [toolCallPart("overwrite_file", { path: "f.ts", content: "good\n" }), finishPart("tool-calls")],
      [textPart("fixed f.ts"), finishPart("stop")],
    ]).model;
    const agent = makeAgent(root, events);
    const result = await agent.run("write f.ts");
    agent.close();

    const evalEvents = events.filter((e) => e.type === "eval") as any[];
    expect(evalEvents.length).toBe(2);
    expect(evalEvents[0].passed).toBe(false);
    expect(evalEvents[1].passed).toBe(true);
    expect(result.success).toBe(true);
  });

  it("coding: rolls back when verification never passes", async () => {
    // maxEvalRetries=2 → 3 eval attempts, all fail
    ev.queue = [
      { passed: false, command: "test", exitCode: 1, stdout: "", stderr: "e1" },
      { passed: false, command: "test", exitCode: 1, stdout: "", stderr: "e2" },
      { passed: false, command: "test", exitCode: 1, stdout: "", stderr: "e3" },
    ];
    h.model = scriptedModel([
      [toolCallPart("write_file", { path: "broken.ts", content: "v1\n" }), finishPart("tool-calls")],
      [textPart("wrote broken.ts"), finishPart("stop")],
    ]).model;
    const agent = makeAgent(root, events);
    const result = await agent.run("write broken.ts");
    agent.close();

    expect(result.success).toBe(false);
    // broken.ts was newly created this task → rollback should delete it
    expect(existsSync(path.join(root, "broken.ts"))).toBe(false);
  });

  it("coding: escalating nudge recovers when the model stalls before editing", async () => {
    ev.queue = [{ passed: true, command: "test", exitCode: 0, stdout: "ok", stderr: "" }];
    // Model answers with prose twice (no edit), then finally writes the file.
    const sm = scriptedModel([
      [textPart("Here is the code you should add: ..."), finishPart("stop")],
      [textPart("You could put this in the module: ..."), finishPart("stop")],
      [toolCallPart("write_file", { path: "out.ts", content: "export const z = 1;\n" }), finishPart("tool-calls")],
      [textPart("Done — created out.ts."), finishPart("stop")],
    ]);
    h.model = sm.model;
    const agent = makeAgent(root, events);
    const result = await agent.run("implement the out.ts module");
    agent.close();

    expect(existsSync(path.join(root, "out.ts"))).toBe(true);
    // It must have been nudged at least twice before the edit landed.
    expect(sm.calls()).toBeGreaterThanOrEqual(3);
    expect(result.success).toBe(true);
  });

  it("coding: gives up cleanly after exhausting no-edit nudges (no infinite loop)", async () => {
    // Model never edits — always answers with prose.
    const sm = scriptedModel([[textPart("I described the change but won't edit."), finishPart("stop")]]);
    h.model = sm.model;
    const agent = makeAgent(root, events);
    const result = await agent.run("implement a feature in the code");
    agent.close();

    // Terminates (does not hang) and reports no edits.
    expect(result).toBeTruthy();
    expect(result.edits.length).toBe(0);
    // Bounded: 1 initial pass + at most MAX_NO_EDIT_NUDGES (3) retries.
    expect(sm.calls()).toBeLessThanOrEqual(5);
  });

  it("aborts when the signal is already aborted", async () => {
    h.model = scriptedModel([[textPart("should not run"), finishPart("stop")]]).model;
    const agent = makeAgent(root, events);
    const controller = new AbortController();
    controller.abort();
    await expect(agent.run("do something big", { signal: controller.signal })).rejects.toThrow();
    agent.close();
  });

  it("emits reasoning deltas from native reasoning tokens", async () => {
    h.model = scriptedModel([
      [reasoningPart("Let me think about this."), textPart("The answer is 42."), finishPart("stop")],
    ]).model;
    const agent = makeAgent(root, events);
    await agent.run("what is the answer");
    agent.close();

    expect(events.some((e) => e.type === "reasoning_delta")).toBe(true);
    expect(textOf()).toContain("42");
  });

  it("drives a multi-step tool sequence itself (read, then read, then answer)", async () => {
    writeFileSync(path.join(root, "a.ts"), "export const a = 1;\n");
    writeFileSync(path.join(root, "b.ts"), "export const b = 2;\n");
    h.model = scriptedModel([
      [toolCallPart("read_file", { path: "a.ts" }, "c1"), finishPart("tool-calls")],
      [toolCallPart("read_file", { path: "b.ts" }, "c2"), finishPart("tool-calls")],
      [textPart("a=1, b=2."), finishPart("stop")],
    ]).model;
    const agent = makeAgent(root, events);
    const result = await agent.run("what are a and b");
    agent.close();

    const reads = (events.filter((e) => e.type === "tool_call") as any[]).filter((e) => e.name === "read_file");
    expect(reads.length).toBe(2);
    expect(events.filter((e) => e.type === "tool_result").length).toBe(2);
    expect(textOf()).toContain("a=1, b=2");
    expect(result.success).toBe(true);
  });

  it("executes multiple read-only tool calls from a single turn", async () => {
    writeFileSync(path.join(root, "a.ts"), "export const a = 1;\n");
    writeFileSync(path.join(root, "b.ts"), "export const b = 2;\n");
    // Two read_file calls in ONE turn → run concurrently, both results returned.
    h.model = scriptedModel([
      [
        toolCallPart("read_file", { path: "a.ts" }, "p1"),
        toolCallPart("read_file", { path: "b.ts" }, "p2"),
        finishPart("tool-calls"),
      ],
      [textPart("Read both files."), finishPart("stop")],
    ]).model;
    const agent = makeAgent(root, events);
    const result = await agent.run("what do a.ts and b.ts contain");
    agent.close();

    const resultEvents = events.filter((e) => e.type === "tool_result") as any[];
    expect(resultEvents.length).toBe(2);
    const ids = resultEvents.map((e) => e.id).sort();
    expect(ids).toEqual(["p1", "p2"]);
    expect(result.success).toBe(true);
  });

  it("parses <thinking> tags out of the text stream into reasoning", async () => {
    h.model = scriptedModel([
      [
        textPart("<thinking>internal plan</thinking>"),
        textPart("Public answer."),
        finishPart("stop"),
      ],
    ]).model;
    const agent = makeAgent(root, events);
    await agent.run("hey there friend");
    agent.close();

    const reasoning = events
      .filter((e) => e.type === "reasoning_delta")
      .map((e) => (e as any).content)
      .join("");
    expect(reasoning).toContain("internal plan");
    // the <thinking> block must NOT leak into user-facing text
    expect(textOf()).not.toContain("internal plan");
    expect(textOf()).toContain("Public answer.");
  });
});
