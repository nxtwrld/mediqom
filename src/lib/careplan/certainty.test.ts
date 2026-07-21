import { describe, it, expect, vi } from "vitest";

vi.mock("$data/signal-catalog", () => ({
  getSignal: (key: string) =>
    ({
      hba1c: { valueExpirationInDays: 90 },
      ldl: { valueExpirationInDays: 180 },
      blood_pressure_systolic: { valueExpirationInDays: 30 },
    })[key],
}));

import {
  certaintyCycleInDays,
  computeTaskCertaintyCycle,
  computeItemCertainty,
  certaintyBucket,
} from "./certainty";
import type { CarePlanItem } from "./types";

function item(overrides: Partial<CarePlanItem> = {}): CarePlanItem {
  return {
    id: "i1",
    diagnosisDescription: "Test",
    conditionType: "chronic",
    certaintyCycleInDays: 180,
    firstSeenDate: "2026-01-01",
    lastSeenInDocumentDate: "2026-01-01",
    confirmingDocuments: ["d1"],
    contradictingDocuments: [],
    status: "active",
    diagnosis: { description: "Test", confidence: "confirmed" },
    tasks: [],
    goals: [],
    medicationIds: [],
    monitoringSignals: [],
    bodyParts: [],
    ...overrides,
  };
}

describe("certaintyCycleInDays", () => {
  it("returns the fixed cadence per condition type", () => {
    expect(
      certaintyCycleInDays({
        conditionType: "exploratory",
        monitoringSignals: [],
      }),
    ).toBe(14);
    expect(
      certaintyCycleInDays({ conditionType: "acute", monitoringSignals: [] }),
    ).toBe(30);
    expect(
      certaintyCycleInDays({
        conditionType: "wellness",
        monitoringSignals: [],
      }),
    ).toBe(90);
    expect(
      certaintyCycleInDays({ conditionType: "chronic", monitoringSignals: [] }),
    ).toBe(180);
  });

  it("monitoring picks the tightest signal cadence", () => {
    expect(
      certaintyCycleInDays({
        conditionType: "monitoring",
        monitoringSignals: ["hba1c", "blood_pressure_systolic"],
      }),
    ).toBe(30);
  });

  it("monitoring with no known signals defaults to 90", () => {
    expect(
      certaintyCycleInDays({
        conditionType: "monitoring",
        monitoringSignals: ["unknown"],
      }),
    ).toBe(90);
  });
});

describe("computeTaskCertaintyCycle", () => {
  it("maps priority to cycle", () => {
    expect(computeTaskCertaintyCycle("immediate")).toBe(3);
    expect(computeTaskCertaintyCycle("urgent")).toBe(14);
    expect(computeTaskCertaintyCycle("routine")).toBe(90);
    expect(computeTaskCertaintyCycle("as_needed")).toBe(180);
  });
});

describe("computeItemCertainty", () => {
  const now = new Date("2026-03-01T00:00:00Z");

  it("a fresh confirmed item is near full certainty", () => {
    const c = computeItemCertainty(
      item({ lastSeenInDocumentDate: "2026-03-01" }),
      now,
    );
    expect(c).toBeGreaterThanOrEqual(0.8);
  });

  it("certainty decays as the item ages", () => {
    const fresh = computeItemCertainty(
      item({ lastSeenInDocumentDate: "2026-02-25" }),
      now,
    );
    const stale = computeItemCertainty(
      item({ lastSeenInDocumentDate: "2025-06-01" }),
      now,
    );
    expect(stale).toBeLessThan(fresh);
  });

  it("lower confidence lowers certainty", () => {
    const confirmed = computeItemCertainty(
      item({ diagnosis: { description: "x", confidence: "confirmed" } }),
      now,
    );
    const suspected = computeItemCertainty(
      item({ diagnosis: { description: "x", confidence: "suspected" } }),
      now,
    );
    expect(suspected).toBeLessThan(confirmed);
  });
});

describe("certaintyBucket", () => {
  it("maps scores to opacity buckets", () => {
    expect(certaintyBucket(0.9).opacity).toBe(1.0);
    expect(certaintyBucket(0.6).opacity).toBe(0.75);
    expect(certaintyBucket(0.4).opacity).toBe(0.55);
    expect(certaintyBucket(0.1).opacity).toBe(0.35);
  });
  it("carries a label key for each bucket", () => {
    expect(certaintyBucket(0.9).labelKey).toContain("careplan.certainty");
    expect(certaintyBucket(0.1).labelKey).toContain("from-your-past");
  });
});
