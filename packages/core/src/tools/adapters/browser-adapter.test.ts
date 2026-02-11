import { describe, it, expect, beforeEach } from "vitest";
import { BrowserAdapter, serializeAccessibilityTree, flattenAccessibilityTree } from "./browser-adapter.js";
import type { BrowserBridge, AccessibilityNode } from "./browser-adapter.js";

function mockBridge(overrides: Partial<BrowserBridge> = {}): BrowserBridge {
  return {
    navigate: async () => {},
    click: async () => {},
    type: async () => {},
    screenshot: async () => "base64data",
    snapshot: async () => ({ role: "document", name: "page", children: [] }),
    evaluate: async (s: string) => `eval:${s}`,
    waitForSelector: async () => {},
    ...overrides,
  };
}

let adapter: BrowserAdapter;

beforeEach(() => {
  adapter = new BrowserAdapter();
});

function exec(action: string, params: Record<string, unknown> = {}) {
  return adapter.execute({
    runId: "r1",
    stepId: "s1",
    params: { action, ...params },
    workingDir: "/tmp",
    capabilities: [],
  });
}

describe("BrowserAdapter", () => {
  it("has correct id and prefix", () => {
    expect(adapter.id).toBe("browser");
    expect(adapter.requiredCapabilityPrefix).toBe("browser");
  });

  it("returns error when bridge not set", async () => {
    const result = await exec("navigate", { url: "https://example.com" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not initialized");
  });

  describe("with bridge", () => {
    beforeEach(() => {
      adapter.setBridge(mockBridge());
    });

    it("navigates to URL", async () => {
      const result = await exec("navigate", { url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("https://example.com");
    });

    it("returns error for navigate without url", async () => {
      const result = await exec("navigate");
      expect(result.success).toBe(false);
      expect(result.error).toContain("url is required");
    });

    it("clicks selector", async () => {
      const result = await exec("click", { selector: "#btn" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("#btn");
    });

    it("returns error for click without selector", async () => {
      const result = await exec("click");
      expect(result.success).toBe(false);
    });

    it("types into selector", async () => {
      const result = await exec("type", { selector: "#input", text: "hello" });
      expect(result.success).toBe(true);
    });

    it("returns error for type without selector or text", async () => {
      const result = await exec("type", { selector: "#input" });
      expect(result.success).toBe(false);
    });

    it("takes screenshot", async () => {
      const result = await exec("screenshot");
      expect(result.success).toBe(true);
      expect(result.output).toBe("base64data");
      expect(result.metadata).toEqual({ format: "base64/png" });
    });

    it("takes accessibility snapshot", async () => {
      const result = await exec("snapshot");
      expect(result.success).toBe(true);
      expect(result.output).toContain("[document] page");
    });

    it("evaluates script", async () => {
      const result = await exec("evaluate", { script: "1+1" });
      expect(result.success).toBe(true);
      expect(result.output).toContain("eval:1+1");
    });

    it("returns error for evaluate without script", async () => {
      const result = await exec("evaluate");
      expect(result.success).toBe(false);
    });

    it("waits for selector", async () => {
      const result = await exec("waitForSelector", { selector: ".loaded" });
      expect(result.success).toBe(true);
    });

    it("returns error for waitForSelector without selector", async () => {
      const result = await exec("waitForSelector");
      expect(result.success).toBe(false);
    });

    it("returns error for unknown action", async () => {
      const result = await exec("foobar");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown browser action");
    });

    it("catches bridge errors", async () => {
      adapter.setBridge(mockBridge({
        navigate: async () => { throw new Error("timeout"); },
      }));
      const result = await exec("navigate", { url: "https://example.com" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout");
    });
  });

  describe("validate", () => {
    it("returns true for valid params", () => {
      expect(adapter.validate({ action: "navigate" })).toBe(true);
    });

    it("returns false for missing action", () => {
      expect(adapter.validate({})).toBe(false);
    });
  });

  describe("estimateCapabilities", () => {
    it("returns browser.read for screenshot", () => {
      expect(adapter.estimateCapabilities({ action: "screenshot" })).toEqual(["browser.read:*"]);
    });

    it("returns browser.write for navigate", () => {
      expect(adapter.estimateCapabilities({ action: "navigate" })).toEqual(["browser.write:*"]);
    });
  });
});

describe("serializeAccessibilityTree", () => {
  it("serializes flat node", () => {
    const node: AccessibilityNode = { role: "button", name: "Submit" };
    expect(serializeAccessibilityTree(node)).toBe("[button] Submit");
  });

  it("serializes node with value and description", () => {
    const node: AccessibilityNode = { role: "textbox", name: "Email", value: "a@b.com", description: "Enter email" };
    expect(serializeAccessibilityTree(node)).toBe('[textbox] Email = "a@b.com" (Enter email)');
  });

  it("serializes nested tree", () => {
    const tree: AccessibilityNode = {
      role: "document",
      name: "page",
      children: [
        { role: "heading", name: "Title" },
        { role: "button", name: "OK" },
      ],
    };
    const output = serializeAccessibilityTree(tree);
    expect(output).toContain("[document] page");
    expect(output).toContain("  [heading] Title");
    expect(output).toContain("  [button] OK");
  });
});

describe("flattenAccessibilityTree", () => {
  it("flattens nested tree", () => {
    const tree: AccessibilityNode = {
      role: "document",
      name: "page",
      children: [
        { role: "heading", name: "Title" },
        { role: "list", name: "items", children: [{ role: "listitem", name: "A" }] },
      ],
    };
    const flat = flattenAccessibilityTree(tree);
    expect(flat).toHaveLength(4);
    expect(flat.map((n) => n.role)).toEqual(["document", "heading", "list", "listitem"]);
  });

  it("handles leaf node", () => {
    const node: AccessibilityNode = { role: "button", name: "OK" };
    expect(flattenAccessibilityTree(node)).toHaveLength(1);
  });
});
