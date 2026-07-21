import { describe, it, expect } from "vitest";
import { extractCarePlanInputs } from "./assembly";

describe("extractCarePlanInputs", () => {
  it("normalises diagnoses with link annotations", () => {
    const content = {
      diagnosis: [
        {
          code: "E11",
          description: "Diabetes",
          confidence: "confirmed",
          linkedCarePlanItemId: "i1",
        },
      ],
    };
    const ext = extractCarePlanInputs(content, "docA", "2026-03-01", true);
    expect(ext.diagnoses[0]).toMatchObject({
      code: "E11",
      linkedCarePlanItemId: "i1",
    });
  });

  it("collects recommendations from all four sources", () => {
    const content = {
      recommendationsDetailed: {
        recommendations: [
          { recommendation: "A", category: "follow_up", priority: "routine" },
        ],
      },
      treatmentPlan: {
        recommendations: [{ recommendation: "B", priority: "urgent" }],
      },
      assessment: { recommendations: [{ recommendation: "C" }] },
      recommendations: [{ urgency: 5, description: "D" }],
    };
    const ext = extractCarePlanInputs(content, "docA", "2026-03-01", true);
    const texts = ext.recommendations.map((r) => r.text).sort();
    expect(texts).toEqual(["A", "B", "C", "D"]);
    const legacy = ext.recommendations.find((r) => r.text === "D")!;
    expect(legacy.priority).toBe("immediate"); // urgency 5 → immediate
  });

  it("strips annotations when hadContext is false", () => {
    const content = {
      diagnosis: [
        { code: "E11", description: "Diabetes", linkedCarePlanItemId: "i1" },
      ],
      recommendationsDetailed: {
        recommendations: [
          { recommendation: "A", linkedCarePlanTaskId: "t1", resolves: ["t2"] },
        ],
      },
    };
    const ext = extractCarePlanInputs(content, "docA", "2026-03-01", false);
    expect(ext.diagnoses[0].linkedCarePlanItemId).toBeUndefined();
    expect(ext.recommendations[0].linkedCarePlanTaskId).toBeUndefined();
    expect(ext.recommendations[0].resolves).toBeUndefined();
  });

  it("normalises body parts and goals", () => {
    const content = {
      bodyParts: [
        { identification: "R_patella", urgency: 3, status: "active" },
      ],
      treatmentPlan: {
        treatmentGoals: [
          { goal: "Reduce pain", sourceQuote: "reduce the pain" },
        ],
      },
    };
    const ext = extractCarePlanInputs(content, "docA", "2026-03-01", true);
    expect(ext.bodyParts[0].identification).toBe("R_patella");
    expect(ext.goals[0]).toMatchObject({
      goal: "Reduce pain",
      sourceQuote: "reduce the pain",
    });
  });

  it("handles empty content gracefully", () => {
    const ext = extractCarePlanInputs({}, "docA", "2026-03-01", true);
    expect(ext.diagnoses).toEqual([]);
    expect(ext.recommendations).toEqual([]);
    expect(ext.goals).toEqual([]);
    expect(ext.bodyParts).toEqual([]);
  });
});
