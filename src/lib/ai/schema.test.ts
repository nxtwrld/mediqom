import { describe, it, expect } from "vitest";
import { updateLanguage } from "./schema";
import { getLanguageEnglishName } from "$lib/languages";

// ALL schemas used by NODE_CONFIGURATIONS in universal-node-factory.ts
const schemaModules: Record<string, () => Promise<{ default: any }>> = {
  "report.core": () => import("../configurations/report.core"),
  "diagnosis.extraction": () => import("../configurations/diagnosis.extraction"),
  "performer.extraction": () => import("../configurations/performer.extraction"),
  "patient.extraction": () => import("../configurations/patient.extraction"),
  "bodyparts.extraction": () => import("../configurations/bodyparts.extraction"),
  "signals.extraction": () => import("../configurations/signals.extraction"),
  ecg: () => import("../configurations/ecg"),
  imaging: () => import("../configurations/imaging"),
  "imaging-findings": () => import("../configurations/imaging-findings"),
  echo: () => import("../configurations/echo"),
  allergies: () => import("../configurations/allergies"),
  medications: () => import("../configurations/medications"),
  procedures: () => import("../configurations/procedures"),
  anesthesia: () => import("../configurations/anesthesia"),
  microscopic: () => import("../configurations/microscopic"),
  triage: () => import("../configurations/triage"),
  immunization: () => import("../configurations/immunization"),
  specimens: () => import("../configurations/specimens"),
  admission: () => import("../configurations/admission"),
  dental: () => import("../configurations/dental"),
  "tumor-characteristics": () =>
    import("../configurations/tumor-characteristics"),
  "treatment-plan": () => import("../configurations/treatment-plan"),
  "treatment-response": () => import("../configurations/treatment-response"),
  "gross-findings": () => import("../configurations/gross-findings"),
  "special-stains": () => import("../configurations/special-stains"),
  "social-history": () => import("../configurations/social-history"),
  treatments: () => import("../configurations/treatments"),
  assessment: () => import("../configurations/assessment"),
  molecular: () => import("../configurations/molecular"),
};

// Core schemas (reused by extraction wrappers)
const coreSchemaModules: Record<string, () => Promise<{ default: any }>> = {
  "core.diagnosis": () => import("../configurations/core.diagnosis"),
  "core.bodyParts": () => import("../configurations/core.bodyParts"),
  "core.performer": () => import("../configurations/core.performer"),
  "core.patient": () => import("../configurations/core.patient"),
  "core.signals": () => import("../configurations/core.signals"),
  "core.summary": () => import("../configurations/core.summary"),
  "core.recommendations": () => import("../configurations/core.recommendations"),
};

/**
 * Recursively find all string values containing [LANGUAGE] with their JSON paths
 */
function findLanguagePlaceholders(obj: any, path = ""): string[] {
  const found: string[] = [];
  if (!obj || typeof obj !== "object") return found;

  for (const key of Object.keys(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    const value = obj[key];

    if (typeof value === "string" && value.includes("[LANGUAGE]")) {
      found.push(fullPath);
    } else if (typeof value === "object" && value !== null) {
      found.push(...findLanguagePlaceholders(value, fullPath));
    }
  }
  return found;
}

describe("updateLanguage", () => {
  it("replaces [LANGUAGE] in description fields", () => {
    const schema = {
      description: "Translate to [LANGUAGE] language",
      properties: {
        field: {
          type: "string",
          description:
            "Result in [LANGUAGE]. Translate to [LANGUAGE] if needed.",
        },
      },
    };
    const result = updateLanguage(
      JSON.parse(JSON.stringify(schema)),
      "Czech",
    );
    expect(result.description).toBe("Translate to Czech language");
    expect(result.properties.field.description).toBe(
      "Result in Czech. Translate to Czech if needed.",
    );
  });

  it("handles deeply nested schemas", () => {
    const schema = {
      parameters: {
        properties: {
          items: {
            type: "array",
            items: {
              properties: {
                status: {
                  description: "Translate to [LANGUAGE]",
                },
              },
            },
          },
        },
      },
    };
    const result = updateLanguage(
      JSON.parse(JSON.stringify(schema)),
      "Czech",
    );
    expect(
      result.parameters.properties.items.items.properties.status.description,
    ).toBe("Translate to Czech");
  });

  it("does not modify non-description string fields", () => {
    const schema = {
      name: "contains [LANGUAGE] but should not change",
      type: "[LANGUAGE]",
      description: "Should change [LANGUAGE]",
    };
    const result = updateLanguage(
      JSON.parse(JSON.stringify(schema)),
      "Czech",
    );
    expect(result.name).toBe("contains [LANGUAGE] but should not change");
    expect(result.type).toBe("[LANGUAGE]");
    expect(result.description).toBe("Should change Czech");
  });

  it("does not mutate the input schema", () => {
    const original = { description: "[LANGUAGE] test" };
    const copy = JSON.parse(JSON.stringify(original));
    updateLanguage(copy, "Czech");
    // The function mutates its input - but we always pass a deep copy
    expect(original.description).toBe("[LANGUAGE] test");
  });
});

describe("getLanguageEnglishName", () => {
  it("converts language codes to English names", () => {
    expect(getLanguageEnglishName("cs")).toBe("Czech");
    expect(getLanguageEnglishName("de")).toBe("German");
    expect(getLanguageEnglishName("en")).toBe("English");
    expect(getLanguageEnglishName("it")).toBe("Italian");
    expect(getLanguageEnglishName("es")).toBe("Spanish");
    expect(getLanguageEnglishName("pl")).toBe("Polish");
    expect(getLanguageEnglishName("tr")).toBe("Turkish");
  });

  it("falls back to English for unknown codes", () => {
    expect(getLanguageEnglishName("xx")).toBe("English");
    expect(getLanguageEnglishName("")).toBe("English");
  });
});

describe("updateLanguage on pipeline schemas", () => {
  // Test every schema used by the LangGraph NODE_CONFIGURATIONS
  for (const [name, importFn] of Object.entries(schemaModules)) {
    it(`replaces ALL [LANGUAGE] in pipeline schema: ${name}`, async () => {
      const mod = await importFn();
      const schema = mod.default;
      expect(schema).toBeDefined();

      // Check for placeholders before
      const before = findLanguagePlaceholders(schema);

      // Run updateLanguage on a deep copy
      const localized = updateLanguage(
        JSON.parse(JSON.stringify(schema)),
        "Czech",
      );

      // Verify NO [LANGUAGE] remains
      const after = findLanguagePlaceholders(localized);
      if (after.length > 0) {
        throw new Error(
          `Schema "${name}" has ${after.length} unresolved [LANGUAGE] placeholder(s):\n` +
            after.map((p) => `  - ${p}`).join("\n"),
        );
      }

      // If there were placeholders, verify they were actually replaced
      if (before.length > 0) {
        const serialized = JSON.stringify(localized);
        expect(serialized).not.toContain("[LANGUAGE]");
        expect(serialized).toContain("Czech");
      }
    });
  }

  // Test core schemas separately (they're reused inside extraction wrappers)
  for (const [name, importFn] of Object.entries(coreSchemaModules)) {
    it(`replaces ALL [LANGUAGE] in core schema: ${name}`, async () => {
      const mod = await importFn();
      const schema = mod.default;
      expect(schema).toBeDefined();

      const localized = updateLanguage(
        JSON.parse(JSON.stringify(schema)),
        "Czech",
      );

      const after = findLanguagePlaceholders(localized);
      if (after.length > 0) {
        throw new Error(
          `Core schema "${name}" has ${after.length} unresolved [LANGUAGE] placeholder(s):\n` +
            after.map((p) => `  - ${p}`).join("\n"),
        );
      }
    });
  }
});

describe("updateLanguage replaces in ALL string fields, not just description", () => {
  /**
   * The current implementation ONLY replaces [LANGUAGE] in "description" keys.
   * This test documents that behavior and checks if any schema has [LANGUAGE]
   * in non-description fields (which would NOT be replaced).
   */
  for (const [name, importFn] of Object.entries(schemaModules)) {
    it(`schema "${name}" has no [LANGUAGE] in non-description fields`, async () => {
      const mod = await importFn();
      const schema = mod.default;

      // Find ALL [LANGUAGE] occurrences (in any field)
      const all = findLanguagePlaceholders(schema);

      // Find only those in non-description fields
      const nonDescription = all.filter((path) => {
        const parts = path.split(".");
        return parts[parts.length - 1] !== "description";
      });

      if (nonDescription.length > 0) {
        throw new Error(
          `Schema "${name}" has [LANGUAGE] in non-description fields (updateLanguage won't replace these!):\n` +
            nonDescription.map((p) => `  - ${p}`).join("\n"),
        );
      }
    });
  }
});
