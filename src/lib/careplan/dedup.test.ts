import { describe, it, expect } from "vitest";
import { matchDiagnosis } from "./dedup";
import type { CarePlanItem, ExtractedDiagnosis } from "./types";

function item(over: Partial<CarePlanItem> = {}): CarePlanItem {
  return {
    id: "i1",
    diagnosisCode: "M76.5",
    diagnosisDescription: "Patellar tendinopathy of the right knee",
    conditionType: "chronic",
    certaintyCycleInDays: 180,
    firstSeenDate: "2026-01-01",
    lastSeenInDocumentDate: "2026-01-01",
    confirmingDocuments: [],
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

describe("matchDiagnosis", () => {
  it("matches by exact ICD-10 (dot/case insensitive)", () => {
    const m = matchDiagnosis(
      { code: "m765", description: "anything" } as ExtractedDiagnosis,
      [item()],
    );
    expect(m).toEqual({ itemId: "i1", method: "icd10", score: 1.0 });
  });

  it("matches by fuzzy description when no code", () => {
    const m = matchDiagnosis(
      {
        description: "Patellar tendinopathy of the right knee",
      } as ExtractedDiagnosis,
      [item({ diagnosisCode: undefined })],
    );
    expect(m?.method).toBe("description");
    expect(m?.score).toBeGreaterThanOrEqual(0.8);
  });

  it("returns null when nothing is similar enough", () => {
    const m = matchDiagnosis(
      { description: "Acute appendicitis" } as ExtractedDiagnosis,
      [item({ diagnosisCode: undefined })],
    );
    expect(m).toBeNull();
  });

  it("uses body-part rollup as a tiebreak with weak description overlap", () => {
    const m = matchDiagnosis(
      { description: "right knee pain" } as ExtractedDiagnosis,
      [
        item({
          diagnosisCode: undefined,
          diagnosisDescription: "right knee pain syndrome",
        }),
      ],
      ["R_patella"],
    );
    expect(m?.method === "description" || m?.method === "bodypart-rollup").toBe(
      true,
    );
  });

  it("does not collapse unrelated conditions in the same region", () => {
    const m = matchDiagnosis(
      { description: "Bone tumor" } as ExtractedDiagnosis,
      [
        item({
          diagnosisCode: undefined,
          diagnosisDescription: "Patellar tendinopathy",
        }),
      ],
      ["R_patella"],
    );
    expect(m).toBeNull();
  });
});
