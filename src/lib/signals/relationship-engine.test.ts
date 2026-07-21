import { describe, it, expect, beforeEach } from "vitest";
import { SignalRelationshipEngine } from "./relationship-engine";
import type { EnhancedSignal } from "$lib/langgraph/state";

// ─── factory helper ──────────────────────────────────────────────────────────

function makeSignal(
  name: string,
  value: string,
  date = "2024-01-01",
): EnhancedSignal {
  return {
    signal: name,
    value,
    date,
    unit: "",
    reference: "",
    source: "extracted",
    context: {
      documentType: "laboratory",
      method: "extracted",
      location: "lab",
      clinicalContext: [],
    },
    validation: {
      status: "validated",
      confidence: 0.9,
      validationSources: [],
      warnings: [],
    },
    relationships: [],
    metadata: {
      extractedBy: "test",
      extractionConfidence: 0.9,
      alternativeInterpretations: [],
      clinicalNotes: "",
    },
  } as any;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("SignalRelationshipEngine", () => {
  let engine: SignalRelationshipEngine;

  beforeEach(() => {
    engine = new SignalRelationshipEngine();
  });

  // ── analyzeRelationships – predefined rules ──────────────────────────────

  describe("predefined rules", () => {
    it("detects total_cholesterol / hdl_cholesterol correlation", async () => {
      const signals = [
        makeSignal("total_cholesterol", "200"),
        makeSignal("hdl_cholesterol", "55"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(rels.some((r) => r.type === "correlates_with")).toBe(true);
    });

    it("detects total_cholesterol / ldl_cholesterol correlation", async () => {
      const signals = [
        makeSignal("total_cholesterol", "200"),
        makeSignal("ldl_cholesterol", "130"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      const ldlRel = rels.find(
        (r) => r.targetSignal === "ldl_cholesterol" && r.type === "correlates_with",
      );
      expect(ldlRel).toBeDefined();
      expect(ldlRel?.strength).toBe(0.8);
    });

    it("detects hemoglobin / hematocrit correlation", async () => {
      const signals = [
        makeSignal("hemoglobin", "14"),
        makeSignal("hematocrit", "42"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(
        rels.some(
          (r) => r.type === "correlates_with" && r.targetSignal === "hematocrit",
        ),
      ).toBe(true);
    });

    it("detects creatinine / bun kidney function correlation", async () => {
      const signals = [
        makeSignal("creatinine", "1.0"),
        makeSignal("bun", "15"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      const kidneyRel = rels.find(
        (r) => r.targetSignal === "bun" || r.targetSignal === "creatinine",
      );
      expect(kidneyRel).toBeDefined();
    });

    it("detects egfr derives_from creatinine rule", async () => {
      const signals = [
        makeSignal("egfr", "75"),
        makeSignal("creatinine", "1.0"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      const derivesRel = rels.find(
        (r) => r.type === "derives_from" && r.targetSignal === "creatinine",
      );
      expect(derivesRel).toBeDefined();
    });

    it("detects alt / ast liver function correlation", async () => {
      const signals = [
        makeSignal("alt", "35"),
        makeSignal("ast", "30"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(
        rels.some(
          (r) => r.type === "correlates_with" && r.targetSignal === "ast",
        ),
      ).toBe(true);
    });

    it("detects glucose / hba1c diabetes correlation", async () => {
      const signals = [
        makeSignal("glucose", "95"),
        makeSignal("hba1c", "5.8"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(
        rels.some(
          (r) => r.type === "correlates_with" && r.targetSignal === "hba1c",
        ),
      ).toBe(true);
    });

    it("detects TSH / T4 inverse correlation", async () => {
      const signals = [
        makeSignal("tsh", "2.5"),
        makeSignal("t4", "1.1"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(rels.some((r) => r.strength < 0 || r.type === "correlates_with")).toBe(true);
    });

    it("returns empty array when no signal pairs match any rule", async () => {
      const signals = [makeSignal("unusual_marker", "42")];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(rels).toHaveLength(0);
    });
  });

  // ── analyzeRelationships – conditional rules ─────────────────────────────

  describe("conditional rules", () => {
    it("flags glucose/insulin contradiction when glucose > 126 and insulin < 5", async () => {
      const signals = [
        makeSignal("glucose", "150"),
        makeSignal("insulin", "3"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(
        rels.some(
          (r) => r.type === "contradicts" && r.targetSignal === "insulin",
        ),
      ).toBe(true);
    });

    it("does NOT flag glucose/insulin contradiction when glucose is normal", async () => {
      const signals = [
        makeSignal("glucose", "90"),
        makeSignal("insulin", "3"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      const glucoseInsulinContradiction = rels.filter(
        (r) =>
          r.type === "contradicts" &&
          (r.targetSignal === "insulin" || r.targetSignal === "glucose"),
      );
      expect(glucoseInsulinContradiction).toHaveLength(0);
    });

    it("does NOT flag glucose/insulin contradiction when insulin is >= 5", async () => {
      const signals = [
        makeSignal("glucose", "150"),
        makeSignal("insulin", "10"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      const contras = rels.filter(
        (r) => r.type === "contradicts" && r.targetSignal === "insulin",
      );
      expect(contras).toHaveLength(0);
    });
  });

  // ── analyzeRelationships – derived relationships ─────────────────────────

  describe("derived relationships", () => {
    it("derives cholesterol_ratio from total_cholesterol / hdl_cholesterol", async () => {
      const signals = [
        makeSignal("total_cholesterol", "200"),
        makeSignal("hdl_cholesterol", "50"),
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      const derived = rels.filter(
        (r) =>
          r.type === "derives_from" && r.targetSignal === "cholesterol_ratio",
      );
      expect(derived).toHaveLength(1);
      expect(derived[0].formula).toContain("4.0");
    });

    it("does NOT derive cholesterol_ratio when hdl is missing", async () => {
      const signals = [makeSignal("total_cholesterol", "200")];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(
        rels.some((r) => r.targetSignal === "cholesterol_ratio"),
      ).toBe(false);
    });

    it("derives egfr_estimated when creatinine is present", async () => {
      const signals = [makeSignal("creatinine", "1.2")];
      const rels = await engine.analyzeRelationships(signals, {});
      const egfr = rels.find(
        (r) => r.type === "derives_from" && r.targetSignal === "egfr_estimated",
      );
      expect(egfr).toBeDefined();
      expect(egfr?.strength).toBe(0.9);
    });

    it("does NOT derive egfr_estimated when creatinine value is 0", async () => {
      const signals = [makeSignal("creatinine", "0")];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(
        rels.some((r) => r.targetSignal === "egfr_estimated"),
      ).toBe(false);
    });

    it("confirms hematocrit when hemoglobin × 3 is within 20% deviation", async () => {
      const signals = [
        makeSignal("hemoglobin", "14"),
        makeSignal("hematocrit", "42"), // 14 × 3 = 42, 0% deviation
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(
        rels.some(
          (r) => r.type === "confirms" && r.targetSignal === "hematocrit",
        ),
      ).toBe(true);
    });

    it("contradicts hematocrit when hemoglobin × 3 deviates > 20%", async () => {
      const signals = [
        makeSignal("hemoglobin", "14"),
        makeSignal("hematocrit", "55"), // expected ≈ 42, deviation > 20%
      ];
      const rels = await engine.analyzeRelationships(signals, {});
      expect(
        rels.some(
          (r) => r.type === "contradicts" && r.targetSignal === "hematocrit",
        ),
      ).toBe(true);
    });
  });

  // ── getRelationshipStrength ──────────────────────────────────────────────

  describe("getRelationshipStrength", () => {
    it("returns strength for a known pair (hemoglobin / hematocrit)", () => {
      expect(engine.getRelationshipStrength("hemoglobin", "hematocrit")).toBe(0.9);
    });

    it("returns strength regardless of argument order (bidirectional lookup)", () => {
      expect(engine.getRelationshipStrength("hematocrit", "hemoglobin")).toBe(0.9);
    });

    it("returns absolute strength for inversely-correlated pair (tsh / t4)", () => {
      // The raw strength is -0.7, but getRelationshipStrength returns Math.abs
      expect(engine.getRelationshipStrength("tsh", "t4")).toBe(0.7);
    });

    it("returns 0 for an unknown signal pair", () => {
      expect(engine.getRelationshipStrength("unusual_a", "unusual_b")).toBe(0);
    });

    it("is case-insensitive", () => {
      expect(engine.getRelationshipStrength("Hemoglobin", "Hematocrit")).toBe(0.9);
    });
  });

  // ── suggestMissingSignals ────────────────────────────────────────────────

  describe("suggestMissingSignals", () => {
    it("suggests HDL Cholesterol when total_cholesterol is present without hdl", () => {
      const signals = [makeSignal("total_cholesterol", "200")];
      const suggestions = engine.suggestMissingSignals(signals);
      expect(suggestions).toContain("HDL Cholesterol");
    });

    it("suggests LDL Cholesterol when total_cholesterol is present without ldl", () => {
      const signals = [makeSignal("total_cholesterol", "200")];
      const suggestions = engine.suggestMissingSignals(signals);
      expect(suggestions).toContain("LDL Cholesterol");
    });

    it("does NOT suggest HDL when hdl_cholesterol is already present", () => {
      const signals = [
        makeSignal("total_cholesterol", "200"),
        makeSignal("hdl_cholesterol", "55"),
      ];
      const suggestions = engine.suggestMissingSignals(signals);
      expect(suggestions).not.toContain("HDL Cholesterol");
    });

    it("suggests Hematocrit when hemoglobin is present without hematocrit", () => {
      const signals = [makeSignal("hemoglobin", "14")];
      const suggestions = engine.suggestMissingSignals(signals);
      expect(suggestions).toContain("Hematocrit");
    });

    it("suggests BUN when creatinine is present without bun", () => {
      const signals = [makeSignal("creatinine", "1.0")];
      const suggestions = engine.suggestMissingSignals(signals);
      expect(suggestions).toContain("BUN");
    });

    it("suggests T4 (Free) when tsh is present without t4", () => {
      const signals = [makeSignal("tsh", "2.5")];
      const suggestions = engine.suggestMissingSignals(signals);
      expect(suggestions).toContain("T4 (Free)");
    });

    it("does NOT suggest T4 when t4 is already present", () => {
      const signals = [
        makeSignal("tsh", "2.5"),
        makeSignal("t4", "1.1"),
      ];
      const suggestions = engine.suggestMissingSignals(signals);
      expect(suggestions).not.toContain("T4 (Free)");
    });

    it("returns empty array when no known signals are present", () => {
      const signals = [makeSignal("unusual_marker", "42")];
      const suggestions = engine.suggestMissingSignals(signals);
      expect(suggestions).toHaveLength(0);
    });
  });

  // ── detectClinicalPatterns ───────────────────────────────────────────────

  describe("detectClinicalPatterns", () => {
    it("detects possible diabetes when glucose > 126", () => {
      const signals = [makeSignal("glucose", "130")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible diabetes mellitus");
    });

    it("detects possible diabetes when hba1c > 6.5", () => {
      const signals = [makeSignal("hba1c", "7.0")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible diabetes mellitus");
    });

    it("detects possible diabetes from glucose_fasting > 126", () => {
      const signals = [makeSignal("glucose_fasting", "140")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible diabetes mellitus");
    });

    it("does NOT detect diabetes when glucose is normal", () => {
      const signals = [makeSignal("glucose", "90")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).not.toContain("Possible diabetes mellitus");
    });

    it("detects anemia in female when hemoglobin < 12.0", () => {
      const signals = [makeSignal("hemoglobin", "11.0")];
      const patterns = engine.detectClinicalPatterns(signals, { sex: "female" });
      expect(patterns).toContain("Possible anemia");
    });

    it("detects anemia in male when hemoglobin < 13.5", () => {
      const signals = [makeSignal("hemoglobin", "13.0")];
      const patterns = engine.detectClinicalPatterns(signals, { sex: "male" });
      expect(patterns).toContain("Possible anemia");
    });

    it("does NOT detect anemia in male when hemoglobin is >= 13.5", () => {
      const signals = [makeSignal("hemoglobin", "14.0")];
      const patterns = engine.detectClinicalPatterns(signals, { sex: "male" });
      expect(patterns).not.toContain("Possible anemia");
    });

    it("detects possible kidney dysfunction when creatinine > 1.3", () => {
      const signals = [makeSignal("creatinine", "1.5")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible kidney dysfunction");
    });

    it("detects possible kidney dysfunction when bun > 20", () => {
      const signals = [makeSignal("bun", "25")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible kidney dysfunction");
    });

    it("detects possible liver dysfunction when alt > 40", () => {
      const signals = [makeSignal("alt", "55")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible liver dysfunction");
    });

    it("detects possible liver dysfunction when ast > 40", () => {
      const signals = [makeSignal("ast", "50")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible liver dysfunction");
    });

    it("detects possible hyperlipidemia when total_cholesterol > 240", () => {
      const signals = [makeSignal("total_cholesterol", "250")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible hyperlipidemia");
    });

    it("detects possible hyperlipidemia when ldl_cholesterol > 160", () => {
      const signals = [makeSignal("ldl_cholesterol", "170")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible hyperlipidemia");
    });

    it("detects possible hyperthyroidism when tsh < 0.4", () => {
      const signals = [makeSignal("tsh", "0.1")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible hyperthyroidism");
    });

    it("detects possible hypothyroidism when tsh > 4.0", () => {
      const signals = [makeSignal("tsh", "5.0")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).toContain("Possible hypothyroidism");
    });

    it("does NOT detect thyroid pattern when tsh is in normal range", () => {
      const signals = [makeSignal("tsh", "2.0")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).not.toContain("Possible hyperthyroidism");
      expect(patterns).not.toContain("Possible hypothyroidism");
    });

    it("returns empty array when all signals are in normal range", () => {
      const signals = [
        makeSignal("glucose", "90"),
        makeSignal("hemoglobin", "14"),
        makeSignal("creatinine", "1.0"),
        makeSignal("alt", "30"),
        makeSignal("total_cholesterol", "190"),
        makeSignal("tsh", "2.0"),
      ];
      const patterns = engine.detectClinicalPatterns(signals, { sex: "male" });
      expect(patterns).toHaveLength(0);
    });

    it("ignores non-numeric signal values gracefully", () => {
      const signals = [makeSignal("glucose", "pending")];
      const patterns = engine.detectClinicalPatterns(signals, {});
      expect(patterns).not.toContain("Possible diabetes mellitus");
    });
  });
});
