import { describe, it, expect } from "vitest";
import {
  buildCarePlanExtractionContext,
  renderContextForPrompt,
} from "./context";
import type { CarePlanDocument, CarePlanItem } from "./types";

function item(over: Partial<CarePlanItem> = {}): CarePlanItem {
  return {
    id: "i1",
    diagnosisCode: "M76.5",
    diagnosisDescription: "Patellar tendinopathy",
    conditionType: "chronic",
    certaintyCycleInDays: 180,
    firstSeenDate: "2026-01-01",
    lastSeenInDocumentDate: "2026-02-01",
    confirmingDocuments: ["d0"],
    contradictingDocuments: [],
    status: "active",
    diagnosis: { description: "Patellar tendinopathy" },
    tasks: [],
    goals: [],
    medicationIds: [],
    monitoringSignals: [],
    bodyParts: [
      { identification: "R_patella", part: "R_knee", sources: ["d0"] },
    ],
    ...over,
  };
}

function plan(items: CarePlanItem[]): CarePlanDocument {
  return { items, historicalItems: [], updatedAt: "2026-02-01" };
}

describe("buildCarePlanExtractionContext", () => {
  it("returns null for an empty plan with no meds", () => {
    expect(buildCarePlanExtractionContext(plan([]), [])).toBeNull();
    expect(buildCarePlanExtractionContext(null, [])).toBeNull();
  });

  it("includes active items with rollup ancestry", () => {
    const ctx = buildCarePlanExtractionContext(plan([item()]), [])!;
    expect(ctx.activeItems).toHaveLength(1);
    expect(ctx.activeItems[0].bodyParts[0].rollup).toEqual([
      "R_knee",
      "R_lower_limb",
      "whole_body",
    ]);
  });

  it("excludes resolved/historical items", () => {
    const ctx = buildCarePlanExtractionContext(
      plan([
        item({ id: "active1" }),
        item({ id: "old1", status: "historical" }),
      ]),
      [],
    )!;
    expect(ctx.activeItems.map((i) => i.id)).toEqual(["active1"]);
  });

  it("collects pending tasks", () => {
    const withTask = item({
      tasks: [
        {
          id: "t1",
          text: "Blood test",
          category: "diagnostic_test",
          priority: "routine",
          sourceDocumentDate: "2026-01-01",
          certaintyCycleInDays: 90,
          status: "pending",
          diagnosisItemId: "i1",
        },
      ],
    });
    const ctx = buildCarePlanExtractionContext(plan([withTask]), [])!;
    expect(ctx.activeTasks).toHaveLength(1);
    expect(ctx.activeTasks[0]).toMatchObject({
      id: "t1",
      diagnosisItemId: "i1",
    });
  });
});

describe("renderContextForPrompt", () => {
  it("renders ids and matching rules deterministically", () => {
    const ctx = buildCarePlanExtractionContext(plan([item()]), [
      { id: "m1", name: "Lisinopril", dose: "10mg", status: "active" },
    ])!;
    const text = renderContextForPrompt(ctx);
    expect(text).toContain("id=i1");
    expect(text).toContain("[M76.5]");
    expect(text).toContain("ICD-10");
    expect(text).toContain("Lisinopril 10mg");
    // deterministic — same input, same output
    expect(renderContextForPrompt(ctx)).toBe(text);
  });
});
