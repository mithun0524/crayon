import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTools } from "./index.js";
import type { ToolContext } from "../types.js";

const fakeIndexer = { search: async () => [], getGraph: () => ({ getDependents: () => [], getDependencies: () => [] }) } as any;

function ctx(root: string, over: Partial<ToolContext> = {}): ToolContext {
  return { workspaceRoot: root, indexer: fakeIndexer, permissionMode: "bypass", ...over };
}

describe("security hardening", () => {
  let root: string;
  beforeEach(async () => { root = realpathSync(await mkdtemp(path.join(os.tmpdir(), "crayon-sec-"))); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  describe("web_fetch SSRF guard", () => {
    const cases = [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:8080/",
      "http://localhost/admin",
      "http://[::1]/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "file:///etc/passwd",
      "ftp://example.com/",
    ];
    for (const url of cases) {
      it(`blocks ${url}`, async () => {
        const tools = createTools(ctx(root));
        const res: any = await tools.web_fetch.execute({ url });
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/blocked|private|loopback|scheme|resolve|SSRF/i);
      });
    }
  });

  describe("repl permission gate", () => {
    it("is denied in plan mode", async () => {
      const tools = createTools(ctx(root, { permissionMode: "plan" }));
      const res: any = await tools.repl.execute({ language: "node", code: "console.log(1)" });
      expect(res.success).toBe(false);
      expect(res.stderr).toMatch(/plan mode/i);
    });
    it("requires approval in auto mode (denied when no approver)", async () => {
      const tools = createTools(ctx(root, { permissionMode: "auto" }));
      const res: any = await tools.repl.execute({ language: "node", code: "console.log(1)" });
      expect(res.success).toBe(false);
      expect(res.stderr).toMatch(/PERMISSION_DENIED/);
    });
  });

  describe("resolvePath option-like filename guard", () => {
    it("rejects a filename starting with '-'", async () => {
      const tools = createTools(ctx(root));
      await expect(tools.write_file.execute({ path: "-rf", content: "x" })).rejects.toThrow(/option-like/i);
    });
  });
});
