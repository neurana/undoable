import { Marked } from "marked";

const marked = new Marked({
  gfm: true,
  breaks: true,
});

/**
 * Close any unterminated markdown blocks so streaming partial
 * content renders cleanly instead of showing raw syntax.
 */
function closeUnterminatedBlocks(text: string): string {
  let result = text;

  /* Close unterminated fenced code blocks */
  const fenceMatches = result.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    result += "\n```";
  }

  /* Close unterminated inline code */
  const backtickSingles = result.match(/(?<!`)`(?!`)/g);
  if (backtickSingles && backtickSingles.length % 2 !== 0) {
    result += "`";
  }

  /* Close unterminated bold */
  const bolds = result.match(/\*\*/g);
  if (bolds && bolds.length % 2 !== 0) {
    result += "**";
  }

  /* Close unterminated italic (single *) — only unmatched ones */
  const allStars = result.match(/\*/g);
  const doubleStars = result.match(/\*\*/g);
  const singleStars = (allStars?.length ?? 0) - (doubleStars?.length ?? 0) * 2;
  if (singleStars % 2 !== 0) {
    result += "*";
  }

  return result;
}

/**
 * Basic HTML sanitization — strip dangerous tags/attributes while keeping
 * the safe HTML that marked produces (p, strong, em, code, pre, ul, ol, li,
 * a, table, thead, tbody, tr, th, td, h1-h6, blockquote, hr, br, img, del, input).
 */
function sanitize(html: string): string {
  /* Remove script/style/iframe/object/embed tags entirely */
  return html
    .replace(/<\/?(?:script|style|iframe|object|embed|form|base)[^>]*>/gi, "")
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

/**
 * Render markdown text to sanitized HTML string.
 * Handles unterminated blocks for streaming content.
 */
export function renderMarkdown(text: string, streaming = false): string {
  if (!text) return "";
  const source = streaming ? closeUnterminatedBlocks(text) : text;
  const raw = marked.parse(source) as string;
  return sanitize(raw);
}
