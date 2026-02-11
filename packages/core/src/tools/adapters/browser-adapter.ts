import type { ToolAdapter, ToolExecuteParams, ToolResult } from "../types.js";

type BrowserAction = "navigate" | "click" | "type" | "screenshot" | "snapshot" | "evaluate" | "waitForSelector";

export type BrowserBridge = {
  navigate(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  screenshot(): Promise<string>;
  snapshot(): Promise<AccessibilityNode>;
  evaluate(script: string): Promise<unknown>;
  waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
};

export type AccessibilityNode = {
  role: string;
  name: string;
  value?: string;
  description?: string;
  children?: AccessibilityNode[];
};

export class BrowserAdapter implements ToolAdapter {
  readonly id = "browser";
  readonly description = "Browser automation (navigate, click, type, screenshot, accessibility snapshot)";
  readonly requiredCapabilityPrefix = "browser";

  private bridge: BrowserBridge | null = null;

  setBridge(bridge: BrowserBridge): void {
    this.bridge = bridge;
  }

  async execute(params: ToolExecuteParams): Promise<ToolResult> {
    if (!this.bridge) {
      return { success: false, output: "", error: "Browser bridge not initialized" };
    }

    const action = params.params.action as BrowserAction;

    try {
      switch (action) {
        case "navigate": {
          const url = params.params.url as string;
          if (!url) return { success: false, output: "", error: "url is required" };
          await this.bridge.navigate(url);
          return { success: true, output: `Navigated to ${url}` };
        }
        case "click": {
          const selector = params.params.selector as string;
          if (!selector) return { success: false, output: "", error: "selector is required" };
          await this.bridge.click(selector);
          return { success: true, output: `Clicked ${selector}` };
        }
        case "type": {
          const selector = params.params.selector as string;
          const text = params.params.text as string;
          if (!selector || !text) return { success: false, output: "", error: "selector and text are required" };
          await this.bridge.type(selector, text);
          return { success: true, output: `Typed into ${selector}` };
        }
        case "screenshot": {
          const base64 = await this.bridge.screenshot();
          return { success: true, output: base64, metadata: { format: "base64/png" } };
        }
        case "snapshot": {
          const tree = await this.bridge.snapshot();
          return { success: true, output: serializeAccessibilityTree(tree) };
        }
        case "evaluate": {
          const script = params.params.script as string;
          if (!script) return { success: false, output: "", error: "script is required" };
          const result = await this.bridge.evaluate(script);
          return { success: true, output: JSON.stringify(result) };
        }
        case "waitForSelector": {
          const selector = params.params.selector as string;
          const timeout = params.params.timeout as number | undefined;
          if (!selector) return { success: false, output: "", error: "selector is required" };
          await this.bridge.waitForSelector(selector, timeout);
          return { success: true, output: `Found ${selector}` };
        }
        default:
          return { success: false, output: "", error: `Unknown browser action: ${action}` };
      }
    } catch (err) {
      return { success: false, output: "", error: `Browser ${action} failed: ${(err as Error).message}` };
    }
  }

  validate(params: Record<string, unknown>): boolean {
    return typeof params.action === "string";
  }

  estimateCapabilities(params: Record<string, unknown>): string[] {
    const action = params.action as string;
    const readActions = ["screenshot", "snapshot", "evaluate", "waitForSelector"];
    if (readActions.includes(action)) return ["browser.read:*"];
    return ["browser.write:*"];
  }
}

export function serializeAccessibilityTree(node: AccessibilityNode, depth = 0): string {
  const indent = "  ".repeat(depth);
  let line = `${indent}[${node.role}] ${node.name}`;
  if (node.value) line += ` = "${node.value}"`;
  if (node.description) line += ` (${node.description})`;

  const lines = [line];
  if (node.children) {
    for (const child of node.children) {
      lines.push(serializeAccessibilityTree(child, depth + 1));
    }
  }
  return lines.join("\n");
}

export function flattenAccessibilityTree(node: AccessibilityNode): AccessibilityNode[] {
  const result: AccessibilityNode[] = [node];
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenAccessibilityTree(child));
    }
  }
  return result;
}
