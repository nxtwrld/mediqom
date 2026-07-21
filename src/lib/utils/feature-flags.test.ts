import { describe, it, expect } from "vitest";
import {
  FEATURE_FLAGS,
  FEATURE_GROUPS,
  isFeatureEnabled,
  isFeatureGroupEnabled,
  getFeatureConfiguration,
} from "./feature-flags";

describe("FEATURE_FLAGS", () => {
  it("exports all expected flag names as booleans", () => {
    const expected = [
      "ENABLE_LANGGRAPH",
      "ENABLE_MULTI_PROVIDER_AI",
      "ENABLE_PROVIDER_FALLBACK",
      "ENABLE_ENHANCED_SIGNALS",
      "ENABLE_SIGNAL_MIGRATION",
      "ENABLE_SIGNAL_RELATIONSHIPS",
      "ENABLE_DYNAMIC_SIGNAL_REGISTRY",
      "ENABLE_ENHANCED_SCHEMAS",
      "ENABLE_DOCUMENT_TYPE_ROUTING",
      "ENABLE_SPECIALIZED_UI",
      "ENABLE_EXTERNAL_VALIDATION",
      "ENABLE_MCP_INTEGRATION",
      "ENABLE_QUALITY_GATES",
      "ENABLE_PROCESSING_METRICS",
      "DEBUG_LANGGRAPH",
      "LOG_AI_RESPONSES",
      "ENABLE_WORKFLOW_TRACING",
    ];
    for (const flag of expected) {
      expect(FEATURE_FLAGS).toHaveProperty(flag);
      expect(typeof FEATURE_FLAGS[flag as keyof typeof FEATURE_FLAGS]).toBe(
        "boolean",
      );
    }
  });
});

describe("FEATURE_GROUPS", () => {
  it("exports well-known groups", () => {
    expect(FEATURE_GROUPS).toHaveProperty("CORE");
    expect(FEATURE_GROUPS).toHaveProperty("AI_PROVIDERS");
    expect(FEATURE_GROUPS).toHaveProperty("SIGNALS");
    expect(FEATURE_GROUPS).toHaveProperty("DOCUMENTS");
    expect(FEATURE_GROUPS).toHaveProperty("EXTERNAL");
    expect(FEATURE_GROUPS).toHaveProperty("QUALITY");
    expect(FEATURE_GROUPS).toHaveProperty("DEBUG");
  });

  it("each flag referenced by a group exists in FEATURE_FLAGS", () => {
    for (const [group, flags] of Object.entries(FEATURE_GROUPS)) {
      for (const flag of flags as readonly string[]) {
        expect(
          FEATURE_FLAGS,
          `${group} references missing flag ${flag}`,
        ).toHaveProperty(flag);
      }
    }
  });
});

describe("isFeatureEnabled", () => {
  it("returns the underlying boolean for a flag", () => {
    const result = isFeatureEnabled("ENABLE_LANGGRAPH");
    expect(typeof result).toBe("boolean");
    expect(result).toBe(FEATURE_FLAGS.ENABLE_LANGGRAPH);
  });
});

describe("isFeatureGroupEnabled", () => {
  it("returns true only when every flag in the group is enabled", () => {
    // In test env with no PUBLIC_ENABLE_* set, all flags are false,
    // so every group should report false.
    const allGroups = Object.keys(FEATURE_GROUPS) as (keyof typeof FEATURE_GROUPS)[];
    for (const g of allGroups) {
      const enabled = isFeatureGroupEnabled(g);
      const every = FEATURE_GROUPS[g].every(
        (f) => FEATURE_FLAGS[f as keyof typeof FEATURE_FLAGS],
      );
      expect(enabled).toBe(every);
    }
  });
});

describe("getFeatureConfiguration", () => {
  it("returns the FEATURE_FLAGS object reference", () => {
    expect(getFeatureConfiguration()).toBe(FEATURE_FLAGS);
  });
});
