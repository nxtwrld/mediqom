import { describe, it, expect, vi } from "vitest";

// The store imports the documents/profiles client layer; mock it so we can unit
// test the pure helpers (archiveOldItems, daysSinceLastDocument) in isolation.
vi.mock("$lib/documents", () => ({
  getDocument: vi.fn(),
  loadDocument: vi.fn(),
  updateDocument: vi.fn(),
  addDocument: vi.fn(),
}));
vi.mock("$lib/profiles/profiles", () => ({ default: { get: vi.fn() } }));
vi.mock("$lib/profiles", () => ({ updateProfile: vi.fn() }));

import {
  archiveOldItems,
  daysSinceLastDocument,
  CAREPLAN_ARCHIVE_THRESHOLD_DAYS,
} from "./store";
import type { CarePlanDocument, CarePlanItem } from "./types";

function item(over: Partial<CarePlanItem> = {}): CarePlanItem {
  return {
    id: "i1",
    diagnosisDescription: "x",
    conditionType: "chronic",
    certaintyCycleInDays: 180,
    firstSeenDate: "2020-01-01",
    lastSeenInDocumentDate: "2020-01-01",
    confirmingDocuments: [],
    contradictingDocuments: [],
    status: "active",
    diagnosis: { description: "x" },
    tasks: [],
    goals: [],
    medicationIds: [],
    monitoringSignals: [],
    bodyParts: [],
    ...over,
  };
}

describe("archiveOldItems", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("archives resolved/historical items older than the threshold", () => {
    const plan: CarePlanDocument = {
      items: [
        item({
          id: "old",
          status: "resolved",
          lastSeenInDocumentDate: "2020-01-01",
        }),
        item({
          id: "recentResolved",
          status: "resolved",
          lastSeenInDocumentDate: "2026-05-01",
        }),
        item({
          id: "activeOld",
          status: "active",
          lastSeenInDocumentDate: "2019-01-01",
        }),
      ],
      historicalItems: [],
      updatedAt: "2026-06-01",
    };
    const out = archiveOldItems(plan, now);
    expect(out.items.map((i) => i.id).sort()).toEqual([
      "activeOld",
      "recentResolved",
    ]);
    expect(out.historicalItems.map((i) => i.id)).toEqual(["old"]);
  });

  it("never archives active items regardless of age", () => {
    const plan: CarePlanDocument = {
      items: [item({ status: "active", lastSeenInDocumentDate: "2000-01-01" })],
      historicalItems: [],
      updatedAt: "2026-06-01",
    };
    expect(archiveOldItems(plan, now).items).toHaveLength(1);
  });

  it("exposes the 3-year threshold constant", () => {
    expect(CAREPLAN_ARCHIVE_THRESHOLD_DAYS).toBe(1095);
  });
});

describe("daysSinceLastDocument", () => {
  it("returns days since the most recent item", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const days = daysSinceLastDocument(
      {
        items: [
          item({ lastSeenInDocumentDate: "2026-03-01" }),
          item({ lastSeenInDocumentDate: "2026-05-01" }),
        ],
      },
      now,
    );
    expect(days).toBe(31);
  });

  it("returns null for an empty plan", () => {
    expect(daysSinceLastDocument({ items: [] })).toBeNull();
  });
});
