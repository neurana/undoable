import { describe, it, expect } from "vitest";
import { analyzeCommand, evaluateCommand, type ExecAllowlistConfig } from "./exec-allowlist.js";

describe("analyzeCommand", () => {
  it("parses simple command", () => {
    const result = analyzeCommand("echo hello");
    expect(result.ok).toBe(true);
    expect(result.segments.length).toBe(1);
    expect(result.segments[0]!.executable).toBe("echo");
    expect(result.segments[0]!.args).toEqual(["hello"]);
    expect(result.hasPipe).toBe(false);
    expect(result.hasChain).toBe(false);
  });

  it("detects pipe", () => {
    const result = analyzeCommand("cat file.txt | grep foo");
    expect(result.ok).toBe(true);
    expect(result.hasPipe).toBe(true);
    expect(result.segments.length).toBe(2);
    expect(result.segments[0]!.executable).toBe("cat");
    expect(result.segments[1]!.executable).toBe("grep");
  });

  it("detects chain with &&", () => {
    const result = analyzeCommand("npm install && npm test");
    expect(result.ok).toBe(true);
    expect(result.hasChain).toBe(true);
    expect(result.segments.length).toBe(2);
    expect(result.segments[0]!.executable).toBe("npm");
    expect(result.segments[1]!.executable).toBe("npm");
  });

  it("detects chain with ;", () => {
    const result = analyzeCommand("echo a; echo b");
    expect(result.ok).toBe(true);
    expect(result.hasChain).toBe(true);
    expect(result.segments.length).toBe(2);
  });

  it("detects chain with ||", () => {
    const result = analyzeCommand("test -f foo || echo missing");
    expect(result.ok).toBe(true);
    expect(result.hasChain).toBe(true);
    expect(result.segments.length).toBe(2);
  });

  it("detects redirect", () => {
    const result = analyzeCommand("echo hello > out.txt");
    expect(result.ok).toBe(true);
    expect(result.hasRedirect).toBe(true);
  });

  it("handles quoted strings", () => {
    const result = analyzeCommand('echo "hello world"');
    expect(result.ok).toBe(true);
    expect(result.segments[0]!.executable).toBe("echo");
    expect(result.segments[0]!.args).toEqual(["hello world"]);
  });

  it("handles single-quoted strings", () => {
    const result = analyzeCommand("echo 'hello world'");
    expect(result.ok).toBe(true);
    expect(result.segments[0]!.args).toEqual(["hello world"]);
  });

  it("returns not ok for empty command", () => {
    expect(analyzeCommand("").ok).toBe(false);
    expect(analyzeCommand("  ").ok).toBe(false);
  });

  it("handles complex pipeline with chain", () => {
    const result = analyzeCommand("cat log.txt | grep error | wc -l && echo done");
    expect(result.ok).toBe(true);
    expect(result.hasPipe).toBe(true);
    expect(result.hasChain).toBe(true);
    expect(result.segments.length).toBe(4);
  });
});

describe("evaluateCommand", () => {
  const fullConfig: ExecAllowlistConfig = {
    security: "full",
    safeBins: new Set(),
    allowlist: [],
  };

  const denyConfig: ExecAllowlistConfig = {
    security: "deny",
    safeBins: new Set(),
    allowlist: [],
  };

  const allowlistConfig: ExecAllowlistConfig = {
    security: "allowlist",
    safeBins: new Set(["echo", "cat", "grep", "ls", "git", "node", "npm"]),
    allowlist: [],
  };

  it("allows everything in full mode", () => {
    const result = evaluateCommand("rm -rf /", fullConfig);
    expect(result.allowed).toBe(true);
  });

  it("denies everything in deny mode", () => {
    const result = evaluateCommand("echo hello", denyConfig);
    expect(result.allowed).toBe(false);
  });

  it("allows safe bins", () => {
    expect(evaluateCommand("echo hello", allowlistConfig).allowed).toBe(true);
    expect(evaluateCommand("cat file.txt", allowlistConfig).allowed).toBe(true);
    expect(evaluateCommand("git status", allowlistConfig).allowed).toBe(true);
    expect(evaluateCommand("npm test", allowlistConfig).allowed).toBe(true);
  });

  it("blocks unknown executables", () => {
    const result = evaluateCommand("malicious-tool --flag", allowlistConfig);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in the allowlist");
  });

  it("allows piped safe bins", () => {
    const result = evaluateCommand("cat file.txt | grep pattern", allowlistConfig);
    expect(result.allowed).toBe(true);
  });

  it("blocks if any segment is not allowed", () => {
    const result = evaluateCommand("cat file.txt | evil-tool", allowlistConfig);
    expect(result.allowed).toBe(false);
  });

  it("allows chained safe bins", () => {
    const result = evaluateCommand("npm install && npm test", allowlistConfig);
    expect(result.allowed).toBe(true);
  });

  it("checks allowlist patterns", () => {
    const config: ExecAllowlistConfig = {
      security: "allowlist",
      safeBins: new Set(["echo"]),
      allowlist: [{ pattern: "python3" }],
    };
    expect(evaluateCommand("python3 script.py", config).allowed).toBe(true);
    expect(evaluateCommand("python2 script.py", config).allowed).toBe(false);
  });

  it("checks glob patterns in allowlist", () => {
    const config: ExecAllowlistConfig = {
      security: "allowlist",
      safeBins: new Set(),
      allowlist: [{ pattern: "python*" }],
    };
    expect(evaluateCommand("python3 script.py", config).allowed).toBe(true);
    expect(evaluateCommand("pythonista main.py", config).allowed).toBe(true);
  });
});
