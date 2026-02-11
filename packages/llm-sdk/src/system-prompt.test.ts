import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "./system-prompt.js";
import type { LLMContext } from "./types.js";

describe("buildSystemPrompt", () => {
  it("includes base instructions", () => {
    const prompt = buildSystemPrompt({ instruction: "fix bug" });
    expect(prompt).toContain("PlanGraph JSON");
    expect(prompt).toContain("Output Format");
    expect(prompt).toContain("Rules");
  });

  it("includes repo structure when provided", () => {
    const ctx: LLMContext = {
      instruction: "test",
      repoStructure: ["src/", "src/index.ts", "package.json"],
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("Repository Structure");
    expect(prompt).toContain("src/index.ts");
  });

  it("includes git status when provided", () => {
    const ctx: LLMContext = {
      instruction: "test",
      gitStatus: "M src/index.ts",
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("Git Status");
    expect(prompt).toContain("M src/index.ts");
  });

  it("includes files when provided", () => {
    const ctx: LLMContext = {
      instruction: "test",
      files: [{ path: "src/app.ts", content: "const x = 1;" }],
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("Relevant Files");
    expect(prompt).toContain("src/app.ts");
    expect(prompt).toContain("const x = 1;");
  });

  it("includes metadata when provided", () => {
    const ctx: LLMContext = {
      instruction: "test",
      metadata: { framework: "react" },
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("Additional Context");
    expect(prompt).toContain("react");
  });

  it("omits sections when not provided", () => {
    const prompt = buildSystemPrompt({ instruction: "test" });
    expect(prompt).not.toContain("Repository Structure");
    expect(prompt).not.toContain("Git Status");
    expect(prompt).not.toContain("Relevant Files");
    expect(prompt).not.toContain("Additional Context");
  });
});

describe("buildUserPrompt", () => {
  it("includes instruction", () => {
    const prompt = buildUserPrompt("fix the login bug");
    expect(prompt).toContain("fix the login bug");
    expect(prompt).toContain("PlanGraph");
  });
});
