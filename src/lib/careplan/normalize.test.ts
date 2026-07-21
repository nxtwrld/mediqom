import { describe, it, expect } from "vitest";
import { normalizeTreatmentGoal, normalizeTreatmentGoals } from "./normalize";

describe("normalizeTreatmentGoal", () => {
  it("wraps a legacy string into { goal }", () => {
    expect(normalizeTreatmentGoal("Reduce LDL by 20%")).toEqual({
      goal: "Reduce LDL by 20%",
    });
  });

  it("trims surrounding whitespace from legacy strings", () => {
    expect(normalizeTreatmentGoal("  walk daily  ")).toEqual({
      goal: "walk daily",
    });
  });

  it("returns null for empty or whitespace-only strings", () => {
    expect(normalizeTreatmentGoal("")).toBeNull();
    expect(normalizeTreatmentGoal("   ")).toBeNull();
  });

  it("passes through structured goals unchanged", () => {
    const structured = {
      goal: "Keep HbA1c below 7.0",
      timeline: "3 months",
      monitoringSignal: "hba1c",
      targetValue: 7.0,
    };
    expect(normalizeTreatmentGoal(structured)).toBe(structured);
  });

  it("rejects objects missing the goal text", () => {
    expect(normalizeTreatmentGoal({ timeline: "3 months" })).toBeNull();
    expect(normalizeTreatmentGoal({ goal: "" })).toBeNull();
    expect(normalizeTreatmentGoal({ goal: "   " })).toBeNull();
  });

  it("rejects null / undefined / non-object scalars", () => {
    expect(normalizeTreatmentGoal(null)).toBeNull();
    expect(normalizeTreatmentGoal(undefined)).toBeNull();
    expect(normalizeTreatmentGoal(42)).toBeNull();
    expect(normalizeTreatmentGoal(true)).toBeNull();
  });
});

describe("normalizeTreatmentGoals", () => {
  it("normalises a mixed array of strings and structured goals", () => {
    const mixed = [
      "Improve mobility",
      {
        goal: "Lower BP",
        targetRange: { min: 110, max: 130 },
        monitoringSignal: "blood_pressure_systolic",
      },
      "  ",
      null,
      { goal: "Stop smoking", category: "preventive" },
    ];

    const result = normalizeTreatmentGoals(mixed);

    expect(result).toEqual([
      { goal: "Improve mobility" },
      {
        goal: "Lower BP",
        targetRange: { min: 110, max: 130 },
        monitoringSignal: "blood_pressure_systolic",
      },
      { goal: "Stop smoking", category: "preventive" },
    ]);
  });

  it("returns empty array for non-array input", () => {
    expect(normalizeTreatmentGoals(undefined)).toEqual([]);
    expect(normalizeTreatmentGoals(null)).toEqual([]);
    expect(normalizeTreatmentGoals({})).toEqual([]);
    expect(normalizeTreatmentGoals("not an array")).toEqual([]);
  });

  it("does not preserve numeric target fields the source never mentioned (regression guard)", () => {
    // The schema instructs the LLM to omit targetValue / targetRange when
    // not explicitly stated. This test asserts our pass-through is faithful:
    // we never invent those fields ourselves.
    const goalsWithoutNumerics = [
      { goal: "Improve patient comfort" },
      { goal: "Walk more often", timeline: "ongoing" },
    ];

    const result = normalizeTreatmentGoals(goalsWithoutNumerics);

    for (const g of result) {
      expect(g.targetValue).toBeUndefined();
      expect(g.targetRange).toBeUndefined();
    }
  });
});
