import { describe, it, expect } from "vitest";
import {
  SchemaDependencyAnalyzer,
  SCHEMA_DEPENDENCIES,
  type SchemaDependency,
  type ValidationResult,
  type CrossValidationInsights,
} from "./schema-dependency-analyzer";

describe("SCHEMA_DEPENDENCIES", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(SCHEMA_DEPENDENCIES)).toBe(true);
    expect(SCHEMA_DEPENDENCIES.length).toBeGreaterThan(0);
  });

  it("all entries have required fields", () => {
    for (const dep of SCHEMA_DEPENDENCIES) {
      expect(dep.sourceSchema).toBeTruthy();
      expect(dep.targetSchema).toBeTruthy();
      expect(dep.fieldPath).toBeTruthy();
      expect(["embeds", "references", "array_of"]).toContain(dep.relationship);
      expect(Array.isArray(dep.validationRules)).toBe(true);
      expect(dep.validationRules.length).toBeGreaterThan(0);
    }
  });

  it("contains core.summary dependencies", () => {
    const summaryDeps = SCHEMA_DEPENDENCIES.filter(
      (d) => d.sourceSchema === "core.summary",
    );
    expect(summaryDeps.length).toBeGreaterThanOrEqual(3);
    const targets = summaryDeps.map((d) => d.targetSchema);
    expect(targets).toContain("core.diagnosis");
    expect(targets).toContain("core.bodyParts");
    expect(targets).toContain("core.performer");
  });

  it("contains ECG dependencies", () => {
    const ecgDeps = SCHEMA_DEPENDENCIES.filter(
      (d) => d.sourceSchema === "ecg",
    );
    expect(ecgDeps.length).toBeGreaterThanOrEqual(1);
  });

  it("validation rules have correct types", () => {
    for (const dep of SCHEMA_DEPENDENCIES) {
      for (const rule of dep.validationRules) {
        expect(["consistency", "completeness", "correlation", "constraint"]).toContain(
          rule.ruleType,
        );
        expect(typeof rule.description).toBe("string");
        expect(typeof rule.validate).toBe("function");
      }
    }
  });
});

describe("SchemaDependencyAnalyzer", () => {
  describe("getDependencies", () => {
    it("returns dependencies for a known schema", () => {
      const deps = SchemaDependencyAnalyzer.getDependencies("core.summary");
      expect(deps.length).toBeGreaterThanOrEqual(3);
      expect(deps.every((d) => d.sourceSchema === "core.summary")).toBe(true);
    });

    it("returns empty array for unknown schema", () => {
      const deps = SchemaDependencyAnalyzer.getDependencies("nonexistent");
      expect(deps).toEqual([]);
    });

    it("returns dependencies for specimens", () => {
      const deps = SchemaDependencyAnalyzer.getDependencies("specimens");
      expect(deps.length).toBeGreaterThanOrEqual(1);
      const targets = deps.map((d) => d.targetSchema);
      expect(targets).toContain("core.bodyParts");
    });
  });

  describe("getDependentSchemas", () => {
    it("returns schemas dependent on core.diagnosis", () => {
      const deps = SchemaDependencyAnalyzer.getDependentSchemas("core.diagnosis");
      expect(deps.length).toBeGreaterThanOrEqual(2);
      const sources = deps.map((d) => d.sourceSchema);
      expect(sources).toContain("core.summary");
    });

    it("returns schemas dependent on core.bodyParts", () => {
      const deps = SchemaDependencyAnalyzer.getDependentSchemas("core.bodyParts");
      expect(deps.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty for schema with no dependents", () => {
      const deps = SchemaDependencyAnalyzer.getDependentSchemas("nonexistent.schema");
      expect(deps).toEqual([]);
    });
  });

  describe("validateCrossSchemaConsistency", () => {
    it("returns empty results when no schema data matches", async () => {
      const results = await SchemaDependencyAnalyzer.validateCrossSchemaConsistency({
        "unknown.schema": { some: "data" },
      });
      expect(Object.keys(results)).toHaveLength(0);
    });

    it("skips dependencies with missing source data", async () => {
      const results = await SchemaDependencyAnalyzer.validateCrossSchemaConsistency({
        "core.diagnosis": { diagnoses: [] },
        // "core.summary" is missing
      });
      // Should not have core.summary → core.diagnosis since source is missing
      const key = "core.summary → core.diagnosis";
      expect(results[key]).toBeUndefined();
    });

    it("runs validations when both schemas present", async () => {
      const results = await SchemaDependencyAnalyzer.validateCrossSchemaConsistency({
        "core.summary": { text: "Patient has diabetes" },
        "core.diagnosis": { diagnoses: [{ code: "E11.9" }] },
        "core.bodyParts": [{ identification: "pancreas" }],
        "core.performer": { name: "Dr. Smith" },
        "core.signals": { signals: [] },
      });
      // Should have results for core.summary dependencies
      expect(Object.keys(results).length).toBeGreaterThanOrEqual(1);
      // Each result should be an array of ValidationResults
      for (const [, validations] of Object.entries(results)) {
        expect(Array.isArray(validations)).toBe(true);
        for (const v of validations) {
          expect(v).toHaveProperty("isValid");
          expect(v).toHaveProperty("confidence");
          expect(v).toHaveProperty("issues");
          expect(v).toHaveProperty("suggestions");
        }
      }
    });

    it("handles validation errors gracefully", async () => {
      // Create a custom dependency that throws
      const originalDeps = [...SCHEMA_DEPENDENCIES];
      SCHEMA_DEPENDENCIES.push({
        sourceSchema: "test.source",
        targetSchema: "test.target",
        fieldPath: "testField",
        relationship: "embeds",
        validationRules: [
          {
            ruleType: "consistency",
            description: "Test rule that throws",
            validate: () => {
              throw new Error("Validation exploded");
            },
          },
        ],
      });

      const results = await SchemaDependencyAnalyzer.validateCrossSchemaConsistency({
        "test.source": { data: true },
        "test.target": { data: true },
      });

      const key = "test.source → test.target";
      expect(results[key]).toBeDefined();
      expect(results[key][0].isValid).toBe(false);
      expect(results[key][0].confidence).toBe(0);
      expect(results[key][0].issues[0].message).toContain("Validation exploded");

      // Cleanup
      SCHEMA_DEPENDENCIES.length = originalDeps.length;
    });
  });

  describe("generateCrossValidationInsights", () => {
    it("returns full consistency for empty results", () => {
      const insights = SchemaDependencyAnalyzer.generateCrossValidationInsights({});
      expect(insights.overallConsistency).toBe(1);
      expect(insights.criticalIssues).toEqual([]);
      expect(insights.suggestions).toEqual([]);
    });

    it("calculates consistency from results", () => {
      const results: Record<string, ValidationResult[]> = {
        "a → b": [
          { isValid: true, confidence: 0.9, issues: [], suggestions: [] },
          { isValid: false, confidence: 0.3, issues: [
            { severity: "warning", field: "f1", message: "warning" },
          ], suggestions: ["Fix it"] },
        ],
      };
      const insights = SchemaDependencyAnalyzer.generateCrossValidationInsights(results);
      expect(insights.overallConsistency).toBe(0.5); // 1 out of 2
      expect(insights.suggestions).toContain("Fix it");
    });

    it("collects critical issues from error-severity", () => {
      const results: Record<string, ValidationResult[]> = {
        "x → y": [
          {
            isValid: false,
            confidence: 0,
            issues: [
              { severity: "error", field: "f1", message: "Critical error" },
              { severity: "warning", field: "f2", message: "Just a warning" },
            ],
            suggestions: [],
          },
        ],
      };
      const insights = SchemaDependencyAnalyzer.generateCrossValidationInsights(results);
      expect(insights.criticalIssues).toHaveLength(1);
      expect(insights.criticalIssues[0].message).toBe("Critical error");
    });

    it("handles all-valid results", () => {
      const results: Record<string, ValidationResult[]> = {
        "a → b": [
          { isValid: true, confidence: 0.95, issues: [], suggestions: [] },
        ],
        "c → d": [
          { isValid: true, confidence: 0.88, issues: [], suggestions: [] },
        ],
      };
      const insights = SchemaDependencyAnalyzer.generateCrossValidationInsights(results);
      expect(insights.overallConsistency).toBe(1);
      expect(insights.criticalIssues).toEqual([]);
    });

    it("aggregates suggestions across relationships", () => {
      const results: Record<string, ValidationResult[]> = {
        "a → b": [
          { isValid: true, confidence: 0.9, issues: [], suggestions: ["Check A"] },
        ],
        "c → d": [
          { isValid: true, confidence: 0.8, issues: [], suggestions: ["Check C"] },
        ],
      };
      const insights = SchemaDependencyAnalyzer.generateCrossValidationInsights(results);
      expect(insights.suggestions).toContain("Check A");
      expect(insights.suggestions).toContain("Check C");
    });
  });
});
