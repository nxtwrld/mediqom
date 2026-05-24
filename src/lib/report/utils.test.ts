import { describe, it, expect } from "vitest";
import {
  getLabValueFor,
  getPercentageFromLastValues,
  getTrendStatusFromLastValues,
} from "./utils";

describe("getLabValueFor", () => {
  it("returns empty array (placeholder implementation)", async () => {
    const result = await getLabValueFor("glucose", "mg/dL");
    expect(result).toEqual([]);
  });

  it("returns empty array for any code and unit", async () => {
    const result = await getLabValueFor("HbA1c", "%");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe("getPercentageFromLastValues", () => {
  it("returns '0' for undefined series", () => {
    expect(getPercentageFromLastValues(undefined)).toBe("0");
  });

  it("returns '0' for empty array", () => {
    expect(getPercentageFromLastValues([])).toBe("0");
  });

  it("returns '0' for populated series (placeholder)", () => {
    const series = [
      { time: new Date(), value: 100 },
      { time: new Date(), value: 110 },
    ];
    expect(getPercentageFromLastValues(series)).toBe("0");
  });
});

describe("getTrendStatusFromLastValues", () => {
  it("returns 'stable' for undefined series", () => {
    expect(getTrendStatusFromLastValues(undefined)).toBe("stable");
  });

  it("returns 'stable' for empty array", () => {
    expect(getTrendStatusFromLastValues([])).toBe("stable");
  });

  it("returns 'stable' for populated series (placeholder)", () => {
    const series = [
      { time: new Date(), value: 90 },
      { time: new Date(), value: 95 },
    ];
    expect(getTrendStatusFromLastValues(series)).toBe("stable");
  });
});
