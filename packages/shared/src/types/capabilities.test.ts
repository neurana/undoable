import { describe, it, expect } from "vitest";
import { parseCapability, matchesCapability } from "./capabilities.js";

describe("parseCapability", () => {
  it("parses scope:pattern", () => {
    expect(parseCapability("fs.read:/home/**")).toEqual({
      scope: "fs.read",
      pattern: "/home/**",
    });
  });

  it("defaults pattern to * when no colon", () => {
    expect(parseCapability("fs.read")).toEqual({
      scope: "fs.read",
      pattern: "*",
    });
  });

  it("handles multiple colons correctly", () => {
    expect(parseCapability("http.request:GET:api.github.com/**")).toEqual({
      scope: "http.request",
      pattern: "GET:api.github.com/**",
    });
  });

  it("handles empty pattern after colon", () => {
    expect(parseCapability("fs.read:")).toEqual({
      scope: "fs.read",
      pattern: "",
    });
  });
});

describe("matchesCapability", () => {
  it("matches exact scope and pattern", () => {
    expect(matchesCapability("fs.read:/src/file.ts", "fs.read:/src/file.ts")).toBe(true);
  });

  it("wildcard grant matches any pattern", () => {
    expect(matchesCapability("fs.read:*", "fs.read:/any/path")).toBe(true);
  });

  it("rejects different scopes", () => {
    expect(matchesCapability("fs.read:*", "fs.write:/any")).toBe(false);
  });

  it("matches /** recursive glob", () => {
    expect(matchesCapability("fs.read:/src/**", "fs.read:/src/a/b/c")).toBe(true);
  });

  it("matches /** at root", () => {
    expect(matchesCapability("fs.read:/src/**", "fs.read:/src/file.ts")).toBe(true);
  });

  it("rejects /** when prefix doesn't match", () => {
    expect(matchesCapability("fs.read:/src/**", "fs.read:/other/file.ts")).toBe(false);
  });

  it("matches /* single-level glob", () => {
    expect(matchesCapability("fs.read:/src/*", "fs.read:/src/file.ts")).toBe(true);
  });

  it("rejects /* for nested paths", () => {
    expect(matchesCapability("fs.read:/src/*", "fs.read:/src/a/b")).toBe(false);
  });

  it("scope-only grant matches scope-only request", () => {
    expect(matchesCapability("fs.read", "fs.read")).toBe(true);
  });

  it("scope-only grant (wildcard) matches any request in scope", () => {
    expect(matchesCapability("fs.read", "fs.read:/anything")).toBe(true);
  });

  it("rejects when grant pattern doesn't cover request", () => {
    expect(matchesCapability("fs.read:/specific", "fs.read:/other")).toBe(false);
  });
});
