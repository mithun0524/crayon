import { describe, it, expect } from "vitest";
import { classifyTask } from "./plan.js";

describe("classifyTask", () => {
  it("treats greetings as chat", () => {
    expect(classifyTask("hey")).toBe("chat");
    expect(classifyTask("hello!")).toBe("chat");
  });

  it("treats how/what questions as advisory", () => {
    expect(classifyTask("how do we build portfolio")).toBe("advisory");
    expect(classifyTask("what is the agent loop")).toBe("advisory");
    expect(classifyTask("explain the indexer")).toBe("advisory");
  });

  it("treats implementation requests as coding", () => {
    expect(classifyTask("fix the failing test in utils.test.ts")).toBe("coding");
    expect(classifyTask("add a login route to the API")).toBe("coding");
    expect(classifyTask("implement auth middleware")).toBe("coding");
  });
});
