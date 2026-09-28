import { describe, it, expect } from "vitest";
import os from "node:os";
import { formatToolResult } from "./appConstants.js";
import { displayPath } from "./components/WelcomeHeader.js";

describe("tool result detail", () => {
  it("says why a command failed instead of a bare 'failed'", () => {
    expect(formatToolResult("terminal", { command: "npm test" }, { success: false, exitCode: 1, stdout: "", stderr: "" }, true).detail).toBe("exit 1");
    expect(formatToolResult("terminal", { command: "x" }, { success: false, exitCode: -1, stderr: "boom\nposix_spawnp failed." }, true).detail).toBe("posix_spawnp failed.");
    expect(formatToolResult("terminal", { command: "x" }, { success: false, error: "PERMISSION_DENIED_BY_USER" }, true).detail).toBe("denied — not run");
  });
});

describe("displayPath", () => {
  it("abbreviates home and elides the middle to fit", () => {
    const p = `${os.homedir()}/code/some/deeply/nested/project-name`;
    expect(displayPath(p, 200)).toBe("~/code/some/deeply/nested/project-name");
    const short = displayPath(p, 20);
    expect(short.length).toBe(20);
    expect(short.startsWith("~/")).toBe(true);
    expect(short.endsWith("project-name")).toBe(true);
  });
});

describe("plan progress is evidence-based", async () => {
  const { planCursor, stepPhase } = await import("./appConstants.js");
  // The exact plan gemma4 produced in the new-user simulation.
  const plan = [
    "Run the test suite to identify all failing test cases",
    "Analyze error logs and stack traces for the failing tests",
    "Debug the underlying logic in the source code causing the failures",
    "Apply fixes to the codebase to resolve the bugs",
    "Verify the fixes by running the tests again",
  ];
  it("classifies steps", () => {
    expect(plan.map(stepPhase)).toEqual([0, 0, 0, 1, 2]);
  });
  it("never reaches 'Apply fixes' without an edit, nor 'Verify' without a post-edit run", () => {
    let i = 0;
    for (let n = 0; n < 10; n++) i = planCursor(plan, i, 0, true); // lots of reads/greps
    expect(i).toBe(2);
    i = planCursor(plan, i, 1, false); // an edit lands
    expect(i).toBe(3);
    i = planCursor(plan, i, 1, true); // more tool calls while still editing
    expect(i).toBe(3);
    i = planCursor(plan, i, 2, true); // ran the tests after editing
    expect(i).toBe(4);
  });
});
