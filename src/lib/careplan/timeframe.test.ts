import { describe, it, expect } from "vitest";
import { computeDueDate, parseTimeframeFallback } from "./timeframe";
import fixtures from "./__tests__/timeframe.fixtures.json";

describe("computeDueDate", () => {
  it("adds weeks to the source date", () => {
    expect(computeDueDate("2026-03-01", { unit: "weeks", value: 2 })).toBe(
      "2026-03-15",
    );
  });
  it("adds months (30-day approximation)", () => {
    expect(computeDueDate("2026-01-01", { unit: "months", value: 1 })).toBe(
      "2026-01-31",
    );
  });
  it("adds years", () => {
    expect(computeDueDate("2026-01-01", { unit: "years", value: 1 })).toBe(
      "2027-01-01",
    );
  });
  it("returns undefined when no timeframe given", () => {
    expect(computeDueDate("2026-03-01", undefined)).toBeUndefined();
    expect(computeDueDate("2026-03-01", null)).toBeUndefined();
  });
  it("returns undefined on an invalid source date", () => {
    expect(
      computeDueDate("not-a-date", { unit: "days", value: 5 }),
    ).toBeUndefined();
  });
});

describe("parseTimeframeFallback (fixture-gated)", () => {
  for (const { text, locale, expect: expected } of fixtures) {
    it(`${locale}: "${text}" → ${JSON.stringify(expected)}`, () => {
      const result = parseTimeframeFallback(text, locale);
      if (expected === null) {
        expect(result).toBeUndefined();
      } else {
        expect(result).toEqual(expected);
      }
    });
  }
});
