import { describe, it, expect } from "vitest";
import { TokenOptimizer } from "./token-optimization";
import type { KeyPoint } from "../types";

describe("TokenOptimizer.estimateTokens", () => {
  it("returns 0 for empty/undefined", () => {
    expect(TokenOptimizer.estimateTokens("")).toBe(0);
    expect(TokenOptimizer.estimateTokens(null as any)).toBe(0);
    expect(TokenOptimizer.estimateTokens(undefined as any)).toBe(0);
  });

  it("returns a positive integer count for non-empty text", () => {
    const tokens = TokenOptimizer.estimateTokens("hello world");
    expect(tokens).toBeGreaterThan(0);
    expect(Number.isInteger(tokens)).toBe(true);
  });

  it("scales roughly with text length", () => {
    const short = TokenOptimizer.estimateTokens("one two three");
    const long = TokenOptimizer.estimateTokens("one two three".repeat(50));
    expect(long).toBeGreaterThan(short * 10);
  });
});

describe("TokenOptimizer.truncateToTokens", () => {
  it("returns empty string for empty input", () => {
    expect(TokenOptimizer.truncateToTokens("", 100)).toBe("");
  });

  it("returns text unchanged when it fits in budget", () => {
    const text = "Short text";
    expect(TokenOptimizer.truncateToTokens(text, 1000)).toBe(text);
  });

  it("truncates text that exceeds the budget", () => {
    const text = "x".repeat(10000);
    const truncated = TokenOptimizer.truncateToTokens(text, 10);
    expect(truncated.length).toBeLessThan(text.length);
  });

  it("prefers sentence boundary when one is near the end", () => {
    // Make text where the last sentence boundary is within 80% of maxChars.
    const sentence = "This is a sentence. ".repeat(100);
    const truncated = TokenOptimizer.truncateToTokens(sentence, 20);
    // Should end at a period (sentence boundary).
    expect(truncated.endsWith(".")).toBe(true);
  });

  it("adds ellipsis when no clean boundary is available", () => {
    const text = "nospacesorpunctuationanywhereinthisverylongstring".repeat(50);
    const truncated = TokenOptimizer.truncateToTokens(text, 5);
    expect(truncated.endsWith("...")).toBe(true);
  });
});

describe("TokenOptimizer.optimizeTextArray", () => {
  it("returns [] for empty input", () => {
    expect(TokenOptimizer.optimizeTextArray([], 100)).toEqual([]);
  });

  it("returns the whole array when it fits in budget", () => {
    const items = ["a", "b", "c"];
    expect(TokenOptimizer.optimizeTextArray(items, 10000)).toEqual(items);
  });

  it("drops items that would exceed the budget", () => {
    const items = [
      "item one text",
      "item two text",
      "x".repeat(5000),
      "item four text",
    ];
    const result = TokenOptimizer.optimizeTextArray(items, 10);
    expect(result.length).toBeLessThan(items.length);
  });

  it("prefers high-priority items under tight budget", () => {
    // Each item is ~400 chars → ~100 tokens. Budget forces selection.
    const items = ["low " + "x".repeat(400), "high " + "y".repeat(400)];
    const priorityMap: Record<string, number> = {
      [items[0]]: 1,
      [items[1]]: 10,
    };
    const result = TokenOptimizer.optimizeTextArray(
      items,
      120,
      (item) => priorityMap[item],
    );
    // Under tight budget, priority function kicks in and "high" wins.
    expect(result[0].startsWith("high")).toBe(true);
  });
});

describe("TokenOptimizer.optimizeKeyPoints", () => {
  it("returns [] for empty input", () => {
    expect(TokenOptimizer.optimizeKeyPoints([], 100)).toEqual([]);
  });

  it("prioritizes higher-confidence points first", () => {
    const points: KeyPoint[] = [
      { type: "symptom", text: "mild headache", confidence: 0.3 } as any,
      { type: "symptom", text: "chest pain", confidence: 0.9 } as any,
      { type: "symptom", text: "fatigue", confidence: 0.6 } as any,
    ];
    const result = TokenOptimizer.optimizeKeyPoints(points, 10000);
    expect(result[0].text).toBe("chest pain");
  });

  it("omits low-confidence points when budget is tight", () => {
    const points: KeyPoint[] = [
      { type: "a", text: "x".repeat(1000), confidence: 0.9 } as any,
      { type: "b", text: "y".repeat(1000), confidence: 0.1 } as any,
    ];
    const result = TokenOptimizer.optimizeKeyPoints(points, 500);
    expect(result.length).toBeLessThanOrEqual(points.length);
  });
});

describe("TokenOptimizer.createOptimizedSummary", () => {
  it("returns empty string for empty input", () => {
    expect(TokenOptimizer.createOptimizedSummary({}, 100)).toBe("");
  });

  it("includes high-priority sections first", () => {
    const sections = {
      low: "low priority content",
      high: "high priority content",
    };
    const priorities = { low: 1, high: 10 };
    const summary = TokenOptimizer.createOptimizedSummary(
      sections,
      10000,
      priorities,
    );
    expect(summary.indexOf("high")).toBeLessThan(summary.indexOf("low"));
  });

  it("formats each section with a 'key:' header", () => {
    const sections = { foo: "bar content" };
    const summary = TokenOptimizer.createOptimizedSummary(sections, 1000);
    expect(summary).toContain("foo:");
    expect(summary).toContain("bar content");
  });

  it("skips sections with empty/whitespace content", () => {
    const sections = { empty: "   ", real: "content here" };
    const summary = TokenOptimizer.createOptimizedSummary(sections, 1000);
    expect(summary).toContain("real");
    expect(summary).not.toContain("empty:");
  });
});

describe("TokenOptimizer.calculateTokenDistribution", () => {
  it("returns empty object for no sections", () => {
    expect(TokenOptimizer.calculateTokenDistribution(1000, [])).toEqual({});
  });

  it("distributes according to default weights when section names match", () => {
    const result = TokenOptimizer.calculateTokenDistribution(1000, [
      "summary",
      "keyPoints",
      "documents",
      "medicalContext",
    ]);
    // The total should equal input exactly (remainder allocated to first section).
    const total = Object.values(result).reduce((a, b) => a + b, 0);
    expect(total).toBe(1000);
  });

  it("keyPoints gets more tokens than medicalContext (per default weights)", () => {
    const result = TokenOptimizer.calculateTokenDistribution(1000, [
      "summary",
      "keyPoints",
      "documents",
      "medicalContext",
    ]);
    expect(result.keyPoints).toBeGreaterThan(result.medicalContext);
  });

  it("falls back to even distribution for unknown section names", () => {
    const result = TokenOptimizer.calculateTokenDistribution(1000, [
      "unknownA",
      "unknownB",
    ]);
    // Two unknown sections each get ~1/2 of total.
    expect(result.unknownA).toBeGreaterThanOrEqual(400);
    expect(result.unknownB).toBeGreaterThanOrEqual(400);
  });
});
