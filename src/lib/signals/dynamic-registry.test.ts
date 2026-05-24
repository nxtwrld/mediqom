import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$data/signal-catalog", () => ({
  getCatalog: vi.fn().mockReturnValue({
    glucose: {
      description: "Blood glucose",
      unit: "mg/dL",
      category: "chemistry",
      synonyms: ["blood sugar"],
      referenceRange: [{ sex: "any", ageRange: { min: 18 }, low: 70, high: 100 }],
    },
    hemoglobin: {
      description: "Hemoglobin",
      unit: "g/dL",
      category: "blood_count",
      synonyms: ["hgb", "hb"],
      referenceRange: [{ sex: "any", ageRange: { min: 18 }, low: 12, high: 17 }],
    },
    cholesterol: {
      description: "Total cholesterol",
      unit: "mg/dL",
      category: "lipids",
      synonyms: ["total cholesterol"],
      referenceRange: [{ sex: "any", ageRange: { min: 18 }, high: 200 }],
    },
    tsh: {
      description: "Thyroid stimulating hormone",
      unit: "μIU/mL",
      category: "hormones",
      synonyms: [],
      referenceRange: [],
    },
  }),
}));

vi.mock("$lib/langgraph/state", () => ({}));
vi.mock("./migration", () => ({}));

import { DynamicSignalRegistry } from "./dynamic-registry";

function makeContext(overrides = {}) {
  return { documentType: "laboratory", specimen: "blood", ...overrides };
}

describe("signals/dynamic-registry", () => {
  let registry;

  beforeEach(() => {
    (DynamicSignalRegistry as any).instance = undefined;
    registry = new DynamicSignalRegistry();
  });

  describe("constructor", () => {
    it("loads known signals from catalog", () => {
      expect(registry.getRegistryStats().knownSignalsCount).toBeGreaterThan(0);
    });

    it("indexes synonyms from catalog (hgb is in known signals)", () => {
      expect(registry.getRegistryStats().knownSignalsCount).toBeGreaterThan(4);
    });
  });

  describe("getInstance", () => {
    it("returns same instance on repeated calls", () => {
      (DynamicSignalRegistry as any).instance = undefined;
      expect(DynamicSignalRegistry.getInstance()).toBe(DynamicSignalRegistry.getInstance());
    });
  });

  describe("normalizeSignalName (private)", () => {
    it("lowercases and removes non-alphanumeric chars", () => {
      expect((registry as any).normalizeSignalName("Blood Glucose")).toBe("bloodglucose");
      expect((registry as any).normalizeSignalName("HbA1c")).toBe("hba1c");
    });

    it("handles empty string", () => {
      expect((registry as any).normalizeSignalName("")).toBe("");
    });
  });

  describe("resolveSignal", () => {
    it("returns isKnown=true for exact catalog match", async () => {
      const r = await registry.resolveSignal("glucose", makeContext());
      expect(r.isKnown).toBe(true);
      expect(r.confidence).toBe(1.0);
    });

    it("returns isKnown=true for synonym", async () => {
      expect((await registry.resolveSignal("blood sugar", makeContext())).isKnown).toBe(true);
    });

    it("returns isKnown=true for indexed synonym hgb", async () => {
      expect((await registry.resolveSignal("hgb", makeContext())).isKnown).toBe(true);
    });

    it("returns isKnown=false for unknown signal with warning", async () => {
      const r = await registry.resolveSignal("fibrinogen", makeContext());
      expect(r.isKnown).toBe(false);
      expect(r.definition.name).toBe("fibrinogen");
      expect(r.warnings.length).toBeGreaterThan(0);
    });

    it("caps confidence at 0.95 for unknown signal", async () => {
      expect((await registry.resolveSignal("unknownsignal", makeContext())).confidence).toBeLessThanOrEqual(0.95);
    });

    it("returns alternatives array for unknown signal", async () => {
      expect(Array.isArray((await registry.resolveSignal("glycose", makeContext())).alternatives)).toBe(true);
    });
  });

  describe("validateSignalValue", () => {
    it("validated for value in normal range", () => {
      expect(registry.validateSignalValue("glucose", 85, "mg/dL", makeContext()).status).toBe("validated");
    });

    it("suspicious for value below normal range", () => {
      const r = registry.validateSignalValue("glucose", 50, "mg/dL", makeContext());
      expect(r.status).toBe("suspicious");
      expect(r.warnings.some((w) => w.includes("below"))).toBe(true);
    });

    it("suspicious for value above normal range", () => {
      const r = registry.validateSignalValue("cholesterol", 250, "mg/dL", makeContext());
      expect(r.status).toBe("suspicious");
      expect(r.warnings.some((w) => w.includes("above"))).toBe(true);
    });

    it("unvalidated for unknown signal", () => {
      const r = registry.validateSignalValue("unknownsignal", 42, "units", makeContext());
      expect(r.status).toBe("unvalidated");
      expect(r.warnings.some((w) => w.includes("not found"))).toBe(true);
    });

    it("adds unit mismatch warning", () => {
      const r = registry.validateSignalValue("glucose", 85, "mmol/L", makeContext());
      expect(r.warnings.some((w) => w.includes("mismatch"))).toBe(true);
    });

    it("validated for known signal without reference range", () => {
      expect(registry.validateSignalValue("tsh", 2.5, "μIU/mL", makeContext()).status).toBe("validated");
    });

    it("confidence is clamped [0,1]", () => {
      const r = registry.validateSignalValue("glucose", 85, "mg/dL", makeContext());
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    });

    it("validationSources includes static_catalog for known signal", () => {
      expect(registry.validateSignalValue("glucose", 85, "mg/dL", makeContext()).validationSources).toContain("static_catalog");
    });
  });

  describe("getRegistryStats", () => {
    it("returns non-zero knownSignalsCount", () => {
      expect(registry.getRegistryStats().knownSignalsCount).toBeGreaterThan(0);
    });

    it("returns categoryCounts object", () => {
      expect(typeof registry.getRegistryStats().categoryCounts).toBe("object");
    });

    it("returns topCategories array with at most 5 elements", () => {
      const tc = registry.getRegistryStats().topCategories;
      expect(Array.isArray(tc)).toBe(true);
      expect(tc.length).toBeLessThanOrEqual(5);
    });
  });

  describe("inferUnit (private)", () => {
    const i = () => registry as any;
    it("mg/dL for glucose", () => expect(i().inferUnit("glucose", makeContext())).toBe("mg/dL"));
    it("g/dL for hemoglobin", () => expect(i().inferUnit("hemoglobin", makeContext())).toBe("g/dL"));
    it("% for hematocrit", () => expect(i().inferUnit("hematocrit", makeContext())).toBe("%"));
    it("mEq/L for sodium", () => expect(i().inferUnit("sodium", makeContext())).toBe("mEq/L"));
    it("K/μL for wbc", () => expect(i().inferUnit("wbc", makeContext())).toBe("K/μL"));
    it("K/μL for platelet", () => expect(i().inferUnit("platelet", makeContext())).toBe("K/μL"));
    it("μIU/mL for tsh", () => expect(i().inferUnit("tsh", makeContext())).toBe("μIU/mL"));
    it("ng/mL for vitamin d", () => expect(i().inferUnit("vitamin d", makeContext())).toBe("ng/mL"));
    it("pg/mL for b12", () => expect(i().inferUnit("b12", makeContext())).toBe("pg/mL"));
    it("mg/dL for blood specimen unknown", () => expect(i().inferUnit("xyz", { specimen: "blood" })).toBe("mg/dL"));
    it("empty for unknown without specimen", () => expect(i().inferUnit("xyz", {})).toBe(""));
    it("mg/dL for cholesterol", () => expect(i().inferUnit("cholesterol", makeContext())).toBe("mg/dL"));
    it("mg/dL for creatinine", () => expect(i().inferUnit("creatinine", makeContext())).toBe("mg/dL"));
    it("M/μL for rbc", () => expect(i().inferUnit("rbc", makeContext())).toBe("M/μL"));
    it("mg/dL for bun", () => expect(i().inferUnit("bun", makeContext())).toBe("mg/dL"));
  });

  describe("generateSynonyms (private)", () => {
    const i = () => registry as any;
    it("hgb, hb for hemoglobin", () => {
      const s = i().generateSynonyms("hemoglobin");
      expect(s).toContain("hgb"); expect(s).toContain("hb");
    });
    it("hct for hematocrit", () => expect(i().generateSynonyms("hematocrit")).toContain("hct"));
    it("plt for platelet", () => expect(i().generateSynonyms("platelet")).toContain("plt"));
    it("wbc for white blood cell", () => expect(i().generateSynonyms("white blood cell")).toContain("wbc"));
    it("rbc for red blood cell", () => expect(i().generateSynonyms("red blood cell")).toContain("rbc"));
    it("empty array for unknown signal", () => expect(Array.isArray(i().generateSynonyms("fibrinogen"))).toBe(true));
  });

  describe("levenshteinDistance (private)", () => {
    const i = () => registry as any;
    it("0 for identical", () => expect(i().levenshteinDistance("glucose", "glucose")).toBe(0));
    it("1 for single insertion", () => expect(i().levenshteinDistance("cat", "cats")).toBe(1));
    it("1 for single deletion", () => expect(i().levenshteinDistance("cats", "cat")).toBe(1));
    it("1 for single substitution", () => expect(i().levenshteinDistance("cat", "bat")).toBe(1));
    it("handles empty strings", () => { expect(i().levenshteinDistance("", "abc")).toBe(3); });
  });

  describe("calculateSimilarity (private)", () => {
    const i = () => registry as any;
    it("1.0 for identical", () => expect(i().calculateSimilarity("glucose", "glucose")).toBe(1.0));
    it("1.0 for two empty strings", () => expect(i().calculateSimilarity("", "")).toBe(1.0));
    it("[0,1] range for similar strings", () => {
      const s = i().calculateSimilarity("glycose", "glucose");
      expect(s).toBeGreaterThan(0); expect(s).toBeLessThanOrEqual(1);
    });
    it("higher for similar than different", () => {
      expect(i().calculateSimilarity("abc", "abcd")).toBeGreaterThan(i().calculateSimilarity("abc", "xyz123"));
    });
  });
});
