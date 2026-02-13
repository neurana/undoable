import { describe, it, expect } from "vitest";
import { parseAttachments } from "./chat-attachments.js";

const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==";
const JPEG_HEADER = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//";

describe("parseAttachments", () => {
  it("parses a valid PNG image", () => {
    const result = parseAttachments([
      { fileName: "test.png", mimeType: "image/png", content: PNG_1x1 },
    ]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.mimeType).toBe("image/png");
    expect(result.images[0]!.data).toBe(PNG_1x1);
    expect(result.textBlocks).toHaveLength(0);
  });

  it("strips data URL prefix", () => {
    const result = parseAttachments([
      { fileName: "test.png", mimeType: "image/png", content: `data:image/png;base64,${PNG_1x1}` },
    ]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.data).toBe(PNG_1x1);
  });

  it("rejects invalid base64", () => {
    expect(() =>
      parseAttachments([{ fileName: "bad.png", mimeType: "image/png", content: "not-base64!" }]),
    ).toThrow(/invalid base64/i);
  });

  it("rejects files over size limit", () => {
    const big = Buffer.alloc(100).toString("base64").repeat(200_000);
    expect(() =>
      parseAttachments([{ fileName: "big.png", mimeType: "image/png", content: big }], { maxBytes: 1000 }),
    ).toThrow(/exceeds/i);
  });

  it("converts text files to text blocks", () => {
    const textContent = Buffer.from("hello world").toString("base64");
    const result = parseAttachments([
      { fileName: "readme.txt", mimeType: "text/plain", content: textContent },
    ]);
    expect(result.images).toHaveLength(0);
    expect(result.textBlocks).toHaveLength(1);
    expect(result.textBlocks[0]).toContain("hello world");
    expect(result.textBlocks[0]).toContain("[File: readme.txt]");
  });

  it("handles mixed images and text files", () => {
    const textContent = Buffer.from("some code").toString("base64");
    const result = parseAttachments([
      { fileName: "screenshot.png", mimeType: "image/png", content: PNG_1x1 },
      { fileName: "main.ts", mimeType: "text/plain", content: textContent },
    ]);
    expect(result.images).toHaveLength(1);
    expect(result.textBlocks).toHaveLength(1);
  });

  it("skips empty content", () => {
    const result = parseAttachments([
      { fileName: "empty.png", mimeType: "image/png", content: "" },
    ]);
    expect(result.images).toHaveLength(0);
    expect(result.textBlocks).toHaveLength(0);
  });

  it("uses sniffed mime over provided when available", () => {
    const result = parseAttachments([
      { fileName: "mislabeled.jpg", mimeType: "image/jpeg", content: PNG_1x1 },
    ]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.mimeType).toBe("image/png");
  });

  it("falls back to provided mime when sniff fails", () => {
    const result = parseAttachments([
      { fileName: "photo.jpg", mimeType: "image/jpeg", content: JPEG_HEADER },
    ]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.mimeType).toBe("image/jpeg");
  });
});
