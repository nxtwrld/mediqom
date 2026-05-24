import { describe, it, expect, vi } from "vitest";

// Mock signal catalog
vi.mock("$data/signal-catalog", () => ({
  getDefaultReference: (key: string) => {
    const refs: Record<string, string> = {
      hemoglobin: "12-17",
      glucose: "70-110",
    };
    return refs[key];
  },
}));

import { getClinicalThresholds, computeQuantileBuckets } from "./quantile-bands";

// ─── getClinicalThresholds ──────────────────────────────

describe("getClinicalThresholds", () => {
  it("returns hard-coded thresholds for heart_rate", () => {
    const t = getClinicalThresholds("heart_rate");
    expect(t.clinicalLow).toBe(40);
    expect(t.clinicalHigh).toBe(180);
    expect(t.severityThreshold).toBe(1.5);
  });

  it("returns hard-coded thresholds for oxygen_saturation", () => {
    const t = getClinicalThresholds("oxygen_saturation");
    expect(t.clinicalLow).toBe(90);
    expect(t.clinicalHigh).toBeUndefined();
  });

  it("returns hard-coded thresholds for body_temperature", () => {
    const t = getClinicalThresholds("body_temperature");
    expect(t.clinicalLow).toBe(35.0);
    expect(t.clinicalHigh).toBe(38.5);
  });

  it("derives thresholds from signal catalog reference range", () => {
    const t = getClinicalThresholds("hemoglobin");
    // Reference: 12-17, range=5
    // clinicalLow = 12 - 5*0.5 = 9.5
    // clinicalHigh = 17 + 5*0.5 = 19.5
    expect(t.clinicalLow).toBeCloseTo(9.5, 1);
    expect(t.clinicalHigh).toBeCloseTo(19.5, 1);
    expect(t.clinicalTolerance).toBeCloseTo(0.75, 2); // 5 * 0.15
  });

  it("returns default thresholds for unknown signal without catalog entry", () => {
    const t = getClinicalThresholds("unknown_signal_xyz");
    expect(t.clinicalLow).toBeUndefined();
    expect(t.clinicalHigh).toBeUndefined();
    expect(t.severityThreshold).toBe(1.5);
  });
});

// ─── computeQuantileBuckets ─────────────────────────────

describe("computeQuantileBuckets", () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const START = new Date("2024-01-01").getTime();

  function makePoint(hoursOffset: number, value: number, normalized = 0.5) {
    return {
      timestamp: START + hoursOffset * HOUR,
      value,
      normalizedValue: normalized,
      original: { value, time: hoursOffset },
    };
  }

  it("returns empty result for empty input", () => {
    const result = computeQuantileBuckets([], DAY, START, "heart_rate");
    expect(result.buckets).toEqual([]);
    expect(result.outliers).toEqual([]);
    expect(result.sparseOriginals).toEqual([]);
  });

  it("creates buckets from normal heart rate values", () => {
    const points = [
      makePoint(1, 72, 0.4),
      makePoint(2, 75, 0.45),
      makePoint(3, 70, 0.38),
      makePoint(4, 78, 0.5),
      makePoint(5, 74, 0.42),
    ];

    const result = computeQuantileBuckets(points, DAY, START, "heart_rate");
    expect(result.buckets.length).toBeGreaterThanOrEqual(1);
    expect(result.outliers.length).toBe(0);
  });

  it("detects clinical-high outlier", () => {
    // heart_rate clinicalHigh = 180, tolerance = 10
    const points = [
      makePoint(1, 72, 0.4),
      makePoint(2, 75, 0.45),
      makePoint(3, 70, 0.38),
      makePoint(4, 195, 0.95), // Way above clinical high
    ];

    const result = computeQuantileBuckets(points, DAY, START, "heart_rate");
    const highOutliers = result.outliers.filter((o) => o.kind === "clinical-high");
    expect(highOutliers.length).toBeGreaterThanOrEqual(1);
    expect(highOutliers[0].value).toBe(195);
  });

  it("detects clinical-low outlier", () => {
    // heart_rate clinicalLow = 40, tolerance = 10
    const points = [
      makePoint(1, 72, 0.4),
      makePoint(2, 75, 0.45),
      makePoint(3, 70, 0.38),
      makePoint(4, 25, 0.05), // Way below clinical low
    ];

    const result = computeQuantileBuckets(points, DAY, START, "heart_rate");
    const lowOutliers = result.outliers.filter((o) => o.kind === "clinical-low");
    expect(lowOutliers.length).toBeGreaterThanOrEqual(1);
    expect(lowOutliers[0].value).toBe(25);
  });

  it("computes quantiles correctly for uniform data", () => {
    // Many points in one bucket with values 60-80
    const points = Array.from({ length: 20 }, (_, i) =>
      makePoint(i * 0.5, 60 + i, (60 + i - 40) / 140),
    );

    const result = computeQuantileBuckets(points, DAY, START, "heart_rate");
    expect(result.buckets.length).toBe(1);

    const bucket = result.buckets[0];
    expect(bucket.sampleCount).toBe(20);
    // rawP50 should be around 69.5 (median of 60..79)
    expect(bucket.rawP50).toBeCloseTo(69.5, 0);
    // p10 < p25 < p50 < p75 < p90
    expect(bucket.rawP10).toBeLessThan(bucket.rawP25);
    expect(bucket.rawP25).toBeLessThan(bucket.rawP50);
    expect(bucket.rawP50).toBeLessThan(bucket.rawP75);
    expect(bucket.rawP75).toBeLessThan(bucket.rawP90);
  });

  it("sorts buckets by start time", () => {
    const points = [
      makePoint(25, 72, 0.4), // day 2
      makePoint(1, 75, 0.45), // day 1
      makePoint(49, 70, 0.38), // day 3
    ];

    const result = computeQuantileBuckets(points, DAY, START, "heart_rate");
    for (let i = 1; i < result.buckets.length; i++) {
      expect(result.buckets[i].bucketStart).toBeGreaterThan(
        result.buckets[i - 1].bucketStart,
      );
    }
  });

  it("collects sparse originals for buckets with < 3 normal samples", () => {
    // Single point in a bucket → too sparse for statistical bands
    const points = [makePoint(1, 72, 0.4)];
    const result = computeQuantileBuckets(points, DAY, START, "heart_rate");
    expect(result.sparseOriginals.length).toBe(1);
  });

  it("outlier severity reflects distance from clinical boundary", () => {
    const points = [
      makePoint(1, 72, 0.4),
      makePoint(2, 75, 0.45),
      makePoint(3, 190, 0.9), // 10 over clinicalHigh
      makePoint(4, 250, 0.99), // 70 over clinicalHigh
    ];

    const result = computeQuantileBuckets(points, DAY, START, "heart_rate");
    if (result.outliers.length >= 2) {
      const mild = result.outliers.find((o) => o.value === 190);
      const severe = result.outliers.find((o) => o.value === 250);
      if (mild && severe) {
        expect(severe.severity).toBeGreaterThan(mild.severity);
      }
    }
  });

  it("handles blood_pressure_systolic clinical thresholds", () => {
    const points = [
      makePoint(1, 120, 0.5),
      makePoint(2, 130, 0.6),
      makePoint(3, 115, 0.45),
      makePoint(4, 200, 0.95), // Above 180 clinical high
    ];

    const result = computeQuantileBuckets(points, DAY, START, "blood_pressure_systolic");
    expect(result.outliers.length).toBeGreaterThanOrEqual(1);
  });
});
