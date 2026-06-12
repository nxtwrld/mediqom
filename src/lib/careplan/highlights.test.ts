import { describe, it, expect, vi } from "vitest";

vi.mock("$data/signal-catalog", () => ({ getSignal: () => undefined }));

import { buildHighlightRegions, meshToItems } from "./highlights";
import type { CarePlanItem } from "./types";

function item(over: Partial<CarePlanItem> = {}): CarePlanItem {
  return {
    id: "i1",
    diagnosisDescription: "x",
    conditionType: "chronic",
    certaintyCycleInDays: 180,
    firstSeenDate: "2026-03-01",
    lastSeenInDocumentDate: "2026-03-01",
    confirmingDocuments: ["d"],
    contradictingDocuments: [],
    status: "active",
    diagnosis: { description: "x", confidence: "confirmed" },
    tasks: [],
    goals: [],
    medicationIds: [],
    monitoringSignals: [],
    bodyParts: [
      {
        identification: "R_patella",
        part: "R_knee",
        urgency: 2,
        sources: ["d"],
      },
    ],
    ...over,
  };
}

describe("buildHighlightRegions", () => {
  const now = new Date("2026-03-02");

  it("expands a body part to leaf meshes with a colour and opacity", () => {
    const regions = buildHighlightRegions([item()], now);
    expect(regions.length).toBeGreaterThan(0);
    const patella = regions.find((r) => r.mesh === "R_patella")!;
    expect(patella).toBeTruthy();
    expect(patella.color).toBeTruthy();
    expect(patella.opacity).toBeGreaterThan(0);
  });

  it("skips resolved and historical items", () => {
    expect(buildHighlightRegions([item({ status: "resolved" })], now)).toEqual(
      [],
    );
    expect(
      buildHighlightRegions([item({ status: "historical" })], now),
    ).toEqual([]);
  });

  it("resolves per-mesh conflicts to the higher-urgency item", () => {
    const low = item({
      id: "low",
      conditionType: "chronic",
      bodyParts: [{ identification: "R_patella", urgency: 1, sources: ["d"] }],
    });
    const high = item({
      id: "high",
      conditionType: "acute",
      bodyParts: [{ identification: "R_patella", urgency: 5, sources: ["d"] }],
    });
    const regions = buildHighlightRegions([low, high], now);
    const patella = regions.find((r) => r.mesh === "R_patella")!;
    // acute colour should win (higher urgency)
    expect(patella.color).toBe(
      buildHighlightRegions([high], now).find((r) => r.mesh === "R_patella")!
        .color,
    );
  });
});

describe("meshToItems", () => {
  it("matches an item by its leaf mesh", () => {
    const got = meshToItems("R_patella", [item()]);
    expect(got).toHaveLength(1);
  });

  it("matches an item via the rollup region", () => {
    const got = meshToItems("R_knee", [item()]);
    expect(got).toHaveLength(1);
  });

  it("does not match unrelated regions", () => {
    expect(meshToItems("heart", [item()])).toHaveLength(0);
  });
});
