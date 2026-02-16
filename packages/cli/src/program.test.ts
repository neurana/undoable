import { describe, it, expect } from "vitest";
import { buildProgram } from "./program.js";

describe("buildProgram", () => {
  it("creates a program named nrn", () => {
    const program = buildProgram();
    expect(program.name()).toBe("nrn");
  });

  it("has version 0.1.0", () => {
    const program = buildProgram();
    expect(program.version()).toBe("0.1.0");
  });

  it("registers all expected commands", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((c) => c.name());

    expect(commandNames).toContain("setup");
    expect(commandNames).toContain("onboard");
    expect(commandNames).toContain("start");
    expect(commandNames).toContain("status");
    expect(commandNames).toContain("daemon");
    expect(commandNames).toContain("plan");
    expect(commandNames).toContain("shadow");
    expect(commandNames).toContain("run");
    expect(commandNames).toContain("apply");
    expect(commandNames).toContain("undo");
    expect(commandNames).toContain("stream");
    expect(commandNames).toContain("receipt");
    expect(commandNames).toContain("verify");
    expect(commandNames).toContain("swarm");
    expect(commandNames).toContain("agent");
    expect(commandNames).toContain("chat");
    expect(commandNames).toContain("config");
    expect(commandNames).toContain("doctor");
  });

  it("has exactly 18 commands", () => {
    const program = buildProgram();
    expect(program.commands).toHaveLength(18);
  });

  it("daemon command has start/stop/status subcommands", () => {
    const program = buildProgram();
    const daemon = program.commands.find((c) => c.name() === "daemon");
    const subNames = daemon?.commands.map((c) => c.name());

    expect(subNames).toContain("start");
    expect(subNames).toContain("stop");
    expect(subNames).toContain("status");
  });

  it("agent command has list/status subcommands", () => {
    const program = buildProgram();
    const agent = program.commands.find((c) => c.name() === "agent");
    const subNames = agent?.commands.map((c) => c.name());

    expect(subNames).toContain("list");
    expect(subNames).toContain("status");
  });
});
