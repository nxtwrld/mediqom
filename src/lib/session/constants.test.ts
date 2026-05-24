import { describe, it, expect } from "vitest";
import {
  QUESTION_SCORING,
  MEDICAL_CATEGORIES,
  ANALYSIS_THRESHOLDS,
} from "./constants";
import type { QuestionCategory, AlertCategory } from "./constants";

describe("QUESTION_SCORING", () => {
  it("has urgency scores for all expected categories", () => {
    const expectedCategories: QuestionCategory[] = [
      "red_flag",
      "risk_assessment",
      "drug_interaction",
      "contraindication",
      "allergy",
      "warning",
      "diagnostic_clarification",
      "symptom_exploration",
      "treatment_selection",
    ];

    expectedCategories.forEach((cat) => {
      expect(QUESTION_SCORING.URGENCY_SCORES[cat]).toBeDefined();
      expect(typeof QUESTION_SCORING.URGENCY_SCORES[cat]).toBe("number");
    });
  });

  it("scores red_flag highest (10)", () => {
    expect(QUESTION_SCORING.URGENCY_SCORES.red_flag).toBe(10);
  });

  it("scores treatment_selection lowest", () => {
    const scores = Object.values(QUESTION_SCORING.URGENCY_SCORES);
    const minScore = Math.min(...scores);
    expect(QUESTION_SCORING.URGENCY_SCORES.treatment_selection).toBe(minScore);
  });

  it("has weights that sum to 1.0", () => {
    const { URGENCY, RELEVANCE, PRIORITY } = QUESTION_SCORING.WEIGHTS;
    expect(URGENCY + RELEVANCE + PRIORITY).toBeCloseTo(1.0, 10);
  });

  it("has positive scaling constants", () => {
    expect(QUESTION_SCORING.SCALING.PROBABILITY_MULTIPLIER).toBeGreaterThan(0);
    expect(QUESTION_SCORING.SCALING.PRIORITY_INVERSION).toBeGreaterThan(0);
  });
});

describe("MEDICAL_CATEGORIES", () => {
  it("lists question categories in clinical importance order", () => {
    expect(MEDICAL_CATEGORIES.QUESTION_CATEGORIES[0]).toBe("red_flag");
    expect(MEDICAL_CATEGORIES.QUESTION_CATEGORIES.length).toBe(9);
  });

  it("alert categories are a subset of question categories", () => {
    const questionCats = new Set(MEDICAL_CATEGORIES.QUESTION_CATEGORIES);
    MEDICAL_CATEGORIES.ALERT_CATEGORIES.forEach((cat: AlertCategory) => {
      expect(questionCats.has(cat)).toBe(true);
    });
  });

  it("includes drug_interaction and red_flag in alert categories", () => {
    expect(MEDICAL_CATEGORIES.ALERT_CATEGORIES).toContain("drug_interaction");
    expect(MEDICAL_CATEGORIES.ALERT_CATEGORIES).toContain("red_flag");
  });
});

describe("ANALYSIS_THRESHOLDS", () => {
  it("has reasonable diagnosis probability threshold", () => {
    expect(ANALYSIS_THRESHOLDS.MIN_DIAGNOSIS_PROBABILITY).toBeGreaterThan(0);
    expect(ANALYSIS_THRESHOLDS.MIN_DIAGNOSIS_PROBABILITY).toBeLessThan(0.5);
  });

  it("high confidence threshold is between 0.5 and 1.0", () => {
    expect(ANALYSIS_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD).toBeGreaterThanOrEqual(0.5);
    expect(ANALYSIS_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(1.0);
  });

  it("has positive question limit", () => {
    expect(ANALYSIS_THRESHOLDS.DEFAULT_QUESTION_LIMIT).toBeGreaterThan(0);
  });

  it("critical priority threshold is in valid range", () => {
    expect(ANALYSIS_THRESHOLDS.CRITICAL_PRIORITY_THRESHOLD).toBeGreaterThan(0);
    expect(ANALYSIS_THRESHOLDS.CRITICAL_PRIORITY_THRESHOLD).toBeLessThanOrEqual(10);
  });
});
