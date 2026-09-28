import { describe, it, expect } from "vitest";
import { classifyTask, taskExpectsEdits } from "./plan.js";

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

  it("treats short imperatives as coding, not small talk", () => {
    expect(classifyTask("run the tests again")).toBe("coding");
    expect(classifyTask("Run npm test")).toBe("coding");
    expect(classifyTask("commit these changes")).toBe("coding");
    expect(classifyTask("please check the build")).toBe("coding");
    expect(classifyTask("ok thanks")).toBe("chat");
    expect(classifyTask("nice work")).toBe("chat");
  });

  it("knows which coding tasks must edit files", () => {
    expect(taskExpectsEdits("run the tests again")).toBe(false);
    expect(taskExpectsEdits("commit these changes")).toBe(false);
    expect(taskExpectsEdits("fix the failing tests")).toBe(true);
    expect(taskExpectsEdits("the tests are failing, can you fix them?")).toBe(true);
  });
});
