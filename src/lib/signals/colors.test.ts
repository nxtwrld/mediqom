import { describe, it, expect } from "vitest";
import {
  SIGNAL_PALETTE,
  hashSignalName,
  getSignalColor,
  getSignalColorVar,
  getSignalColorIndex,
} from "./colors";

describe("SIGNAL_PALETTE", () => {
  it("has exactly 30 hex colors", () => {
    expect(SIGNAL_PALETTE.length).toBe(30);
    for (const c of SIGNAL_PALETTE) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("hashSignalName", () => {
  it("is deterministic — same input → same index", () => {
    expect(hashSignalName("cholesterol")).toBe(hashSignalName("cholesterol"));
  });

  it("returns a non-negative index within palette bounds", () => {
    const idx = hashSignalName("glucose");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(SIGNAL_PALETTE.length);
  });

  it("handles the empty string", () => {
    const idx = hashSignalName("");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(SIGNAL_PALETTE.length);
  });

  it("produces different indexes for clearly different inputs", () => {
    // Not a strict guarantee, but across many samples collisions should be rare.
    const samples = [
      "cholesterol",
      "glucose",
      "hemoglobin",
      "creatinine",
      "sodium",
    ];
    const uniques = new Set(samples.map(hashSignalName));
    expect(uniques.size).toBeGreaterThan(1);
  });
});

describe("getSignalColor / getSignalColorVar / getSignalColorIndex", () => {
  it("returns a palette hex for a given name", () => {
    const color = getSignalColor("glucose");
    expect(SIGNAL_PALETTE).toContain(color);
  });

  it("returns a 1-based CSS var in the categ2-N range", () => {
    const cssVar = getSignalColorVar("glucose");
    expect(cssVar).toMatch(/^var\(--color-categ2-\d+\)$/);
    const match = cssVar.match(/categ2-(\d+)/);
    const n = Number(match![1]);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(30);
  });

  it("getSignalColorIndex is 1-based", () => {
    const idx = getSignalColorIndex("glucose");
    expect(idx).toBeGreaterThanOrEqual(1);
    expect(idx).toBeLessThanOrEqual(30);
    expect(idx).toBe(hashSignalName("glucose") + 1);
  });

  it("getSignalColor and getSignalColorIndex are consistent for same input", () => {
    const name = "potassium";
    expect(getSignalColor(name)).toBe(SIGNAL_PALETTE[getSignalColorIndex(name) - 1]);
  });
});
