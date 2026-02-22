import type { ThinkLevel } from "./thinking.js";

export type Directive =
  | { type: "think"; level: ThinkLevel }
  | { type: "model"; value: string }
  | { type: "verbose"; enabled: boolean }
  | { type: "reset" }
  | { type: "status" }
  | { type: "help" };

export type ParseResult = {
  directives: Directive[];
  cleanMessage: string;
};

const THINK_LEVELS = new Set(["off", "low", "medium", "high"]);

const DIRECTIVE_PATTERN = /\/(?:think|model|verbose|reset|status|help)(?:\s+\S+)?/gi;

export function parseDirectives(message: string): ParseResult {
  const directives: Directive[] = [];
  let clean = message;

  const matches = message.match(DIRECTIVE_PATTERN);
  if (!matches) return { directives, cleanMessage: clean.trim() };

  for (const match of matches) {
    const parts = match.trim().split(/\s+/);
    const cmd = parts[0]!.toLowerCase();
    const arg = parts[1]?.trim();

    switch (cmd) {
      case "/think": {
        const level = arg?.toLowerCase();
        if (level && THINK_LEVELS.has(level)) {
          directives.push({ type: "think", level: level as ThinkLevel });
        } else {
          directives.push({ type: "think", level: "high" });
        }
        break;
      }
      case "/model": {
        if (arg) {
          directives.push({ type: "model", value: arg });
        }
        break;
      }
      case "/verbose": {
        const enabled = arg?.toLowerCase() !== "off";
        directives.push({ type: "verbose", enabled });
        break;
      }
      case "/reset":
        directives.push({ type: "reset" });
        break;
      case "/status":
        directives.push({ type: "status" });
        break;
      case "/help":
        directives.push({ type: "help" });
        break;
    }

    clean = clean.replace(match, "");
  }

  return { directives, cleanMessage: clean.trim() };
}

export const DIRECTIVE_HELP = [
  "/think [off|low|medium|high] — Set thinking/reasoning level",
  "/model <name|alias|provider/model> — Switch active model/provider (e.g. /model google/gemini-2.5-pro, /model claude)",
  "/verbose [on|off] — Toggle detailed tool output",
  "/reset — Clear conversation history",
  "/status — Show current model, provider, thinking level",
  "/help — Show available directives",
].join("\n");
