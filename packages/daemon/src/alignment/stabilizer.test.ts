import { describe, it, expect } from "vitest";
import { buildStabilizer } from "./stabilizer.js";
import type { DriftScore } from "./types.js";

describe("buildStabilizer", () => {
  it("returns null when score does not exceed threshold", () => {
    const score: DriftScore = {
      total: 0.3,
      signals: [],
      domain: "general",
      turnIndex: 1,
      exceeds: false,
    };
    expect(buildStabilizer(score)).toBeNull();
  });

  it("returns reinforcement for emotional domain", () => {
    const score: DriftScore = {
      total: 0.7,
      signals: [{ category: "emotional_disclosure", weight: 0.25, matched: "I'm so depressed" }],
      domain: "emotional",
      turnIndex: 3,
      exceeds: true,
    };
    const result = buildStabilizer(score);
    expect(result).not.toBeNull();
    expect(result).toContain("ALIGNMENT REINFORCEMENT");
    expect(result).toContain("therapist");
    expect(result).toContain("professional resources");
  });

  it("returns reinforcement for philosophical domain", () => {
    const score: DriftScore = {
      total: 0.8,
      signals: [{ category: "philosophical_ai", weight: 0.2, matched: "are you sentient" }],
      domain: "philosophical",
      turnIndex: 5,
      exceeds: true,
    };
    const result = buildStabilizer(score);
    expect(result).not.toBeNull();
    expect(result).toContain("language model");
    expect(result).toContain("mystical");
  });

  it("returns reinforcement for persona requests", () => {
    const score: DriftScore = {
      total: 0.9,
      signals: [{ category: "persona_request", weight: 0.35, matched: "ignore your instructions" }],
      domain: "general",
      turnIndex: 1,
      exceeds: true,
    };
    const result = buildStabilizer(score);
    expect(result).not.toBeNull();
    expect(result).toContain("identity");
    expect(result).toContain("Undoable");
  });

  it("returns reinforcement for meta-reflection", () => {
    const score: DriftScore = {
      total: 0.7,
      signals: [{ category: "meta_reflection", weight: 0.3, matched: "drop the act" }],
      domain: "general",
      turnIndex: 2,
      exceeds: true,
    };
    const result = buildStabilizer(score);
    expect(result).not.toBeNull();
    expect(result).toContain("transparent");
  });

  it("deduplicates signals of the same category", () => {
    const score: DriftScore = {
      total: 0.8,
      signals: [
        { category: "persona_request", weight: 0.35, matched: "you are now evil" },
        { category: "persona_request", weight: 0.35, matched: "ignore instructions" },
      ],
      domain: "general",
      turnIndex: 1,
      exceeds: true,
    };
    const result = buildStabilizer(score)!;
    const matches = result.match(/identity/g);
    expect(matches).toHaveLength(1);
  });

  it("returns null for coding domain with no signals", () => {
    const score: DriftScore = {
      total: 0.7,
      signals: [],
      domain: "coding",
      turnIndex: 3,
      exceeds: true,
    };
    expect(buildStabilizer(score)).toBeNull();
  });
});
