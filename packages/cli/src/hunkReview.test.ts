import { describe, it, expect } from "vitest";
import { structuredPatch } from "diff";
import { computePartialEdit } from "./ui/appConstants.js";

// A file with two well-separated changes → two independent hunks.
const ORIGINAL = [
  "line 1", "line 2", "line 3", "line 4", "line 5",
  "line 6", "line 7", "line 8", "line 9", "line 10",
  "line 11", "line 12", "line 13", "line 14", "line 15",
].join("\n") + "\n";

// Change line 2 (top hunk) and line 14 (bottom hunk).
const PROPOSED = ORIGINAL
  .replace("line 2", "line 2 CHANGED")
  .replace("line 14", "line 14 CHANGED");

function patch() {
  return structuredPatch("f.txt", "f.txt", ORIGINAL, PROPOSED);
}

describe("computePartialEdit", () => {
  it("produces two hunks for two separated changes", () => {
    expect(patch().hunks.length).toBe(2);
  });

  it("returns true when every hunk is accepted", () => {
    expect(computePartialEdit(ORIGINAL, patch(), [true, true])).toBe(true);
  });

  it("returns false when no hunk is accepted", () => {
    expect(computePartialEdit(ORIGINAL, patch(), [false, false])).toBe(false);
  });

  it("accepts only the first hunk — top change applied, bottom untouched", () => {
    const out = computePartialEdit(ORIGINAL, patch(), [true, false]);
    expect(typeof out).toBe("string");
    const s = out as string;
    expect(s).toContain("line 2 CHANGED");
    expect(s).toContain("line 14");
    expect(s).not.toContain("line 14 CHANGED");
  });

  it("accepts only the second hunk — bottom change applied, top untouched", () => {
    const out = computePartialEdit(ORIGINAL, patch(), [false, true]) as string;
    expect(out).toContain("line 14 CHANGED");
    expect(out).toContain("line 2\n");
    expect(out).not.toContain("line 2 CHANGED");
  });
});
