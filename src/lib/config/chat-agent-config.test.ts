import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock variables so they can be referenced inside vi.mock() factories
const { mockGetLanguageEnglishName } = vi.hoisted(() => ({
  mockGetLanguageEnglishName: vi.fn().mockReturnValue("English"),
}));

vi.mock("$lib/languages", () => ({
  getLanguageEnglishName: mockGetLanguageEnglishName,
}));

vi.mock("../../../config/chat-agents/lab-results.json", () => ({
  default: {
    agentType: "lab_results",
    description: "Lab results analysis agent",
    prompts: {
      patient: {
        systemPrompt: {
          title: "Lab Results Analyzer",
          instructions: ["Analyze lab results", "Explain values"],
          widgetInstructions: ["Use widgets"],
        },
      },
      clinical: {
        systemPrompt: {
          title: "Clinical Lab Analysis",
          instructions: ["Clinical analysis", "Reference ranges"],
          widgetInstructions: [],
        },
      },
      caregiver: {
        systemPrompt: {
          title: "Lab Results for Caregiver",
          instructions: ["Simplified explanation"],
          widgetInstructions: [],
        },
      },
    },
    responseSchema: {
      widgets: { allowedTypes: ["lab_value", "trend_chart"] },
    },
  },
}));

vi.mock("../../../config/chat.json", () => ({
  default: {
    prompts: {
      patient: {
        responseSchema: {
          additionalProperties: {
            mood: { type: "string" },
          },
        },
      },
      clinical: {
        responseSchema: {
          additionalProperties: {
            clinicalNotes: { type: "string" },
          },
        },
      },
    },
    responseSchema: {
      base: {
        parameters: {
          properties: {
            widgets: {
              items: {
                properties: {
                  type: {
                    enum: ["lab_value", "trend_chart", "data_table"],
                  },
                },
              },
            },
            toolCalls: { type: "array" },
            agentType: { type: "string" },
            consentRequests: { type: "array" },
            clarifyingQuestions: { type: "array" },
          },
        },
      },
    },
  },
}));

import { chatAgentConfigManager } from "./chat-agent-config";

describe("config/chat-agent-config — ChatAgentConfigManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLanguageEnglishName.mockReturnValue("English");
  });

  // ── hasAgent ────────────────────────────────────────────────────────────

  describe("hasAgent", () => {
    it("returns true for registered agent type", () => {
      expect(chatAgentConfigManager.hasAgent("lab_results")).toBe(true);
    });

    it("returns false for unknown agent type", () => {
      expect(chatAgentConfigManager.hasAgent("unknown_agent")).toBe(false);
    });
  });

  // ── buildSubAgentPrompt ─────────────────────────────────────────────────

  describe("buildSubAgentPrompt", () => {
    it("returns a non-empty string", () => {
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "en",
        {},
      );
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("includes the title from the agent config", () => {
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "en",
        {},
      );
      expect(prompt).toContain("Lab Results Analyzer");
    });

    it("includes instructions from the agent config", () => {
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "en",
        {},
      );
      expect(prompt).toContain("Analyze lab results");
      expect(prompt).toContain("Explain values");
    });

    it("uses clinical prompts when mode is 'clinical'", () => {
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "clinical",
        "en",
        {},
      );
      expect(prompt).toContain("Clinical Lab Analysis");
      expect(prompt).toContain("Clinical analysis");
    });

    it("uses caregiver prompts when mode is 'caregiver'", () => {
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "caregiver",
        "en",
        {},
      );
      expect(prompt).toContain("Lab Results for Caregiver");
    });

    it("includes language name in the prompt", () => {
      mockGetLanguageEnglishName.mockReturnValue("German");
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "de",
        {},
      );
      expect(prompt).toContain("German");
      expect(mockGetLanguageEnglishName).toHaveBeenCalledWith("de");
    });

    it("includes current date in the prompt", () => {
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "en",
        {},
      );
      expect(prompt).toContain("Current Date:");
    });

    it("includes safety instruction", () => {
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "en",
        {},
      );
      expect(prompt).toContain("CRITICAL SAFETY INSTRUCTION");
    });

    it("includes assembledContext summary when provided", () => {
      const assembledContext = { summary: "Patient has elevated glucose." };
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "en",
        {},
        assembledContext,
      );
      expect(prompt).toContain("Patient has elevated glucose.");
      expect(prompt).toContain("Patient Summary");
    });

    it("does not include Patient Summary section when assembledContext has no summary", () => {
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "en",
        {},
        {},
      );
      expect(prompt).not.toContain("Patient Summary");
    });

    it("includes vitals from pageContext.availableData.vitals", () => {
      const pageContext = {
        availableData: {
          vitals: ["Blood Pressure: 120/80", "Heart Rate: 72 bpm"],
        },
      };
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "en",
        pageContext,
      );
      expect(prompt).toContain("PATIENT VITALS & DEMOGRAPHICS");
      expect(prompt).toContain("Blood Pressure: 120/80");
      expect(prompt).toContain("Heart Rate: 72 bpm");
    });

    it("does not include vitals section when pageContext has empty vitals", () => {
      const pageContext = { availableData: { vitals: [] } };
      const prompt = chatAgentConfigManager.buildSubAgentPrompt(
        "lab_results",
        "patient",
        "en",
        pageContext,
      );
      expect(prompt).not.toContain("PATIENT VITALS & DEMOGRAPHICS");
    });

    it("throws for unknown agent type", () => {
      expect(() =>
        chatAgentConfigManager.buildSubAgentPrompt("unknown", "patient", "en", {}),
      ).toThrow("Unknown sub-agent type: unknown");
    });
  });

  // ── createSubAgentSchema ────────────────────────────────────────────────

  describe("createSubAgentSchema", () => {
    it("returns a schema object", () => {
      const schema = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "patient",
      );
      expect(schema).toBeDefined();
      expect(schema.parameters).toBeDefined();
    });

    it("narrows widget allowedTypes to agent-specific types", () => {
      const schema = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "patient",
      );
      const typeEnum =
        schema.parameters.properties.widgets.items.properties.type.enum;
      expect(typeEnum).toEqual(["lab_value", "trend_chart"]);
    });

    it("removes toolCalls from schema properties", () => {
      const schema = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "patient",
      );
      expect(schema.parameters.properties.toolCalls).toBeUndefined();
    });

    it("removes agentType from schema properties", () => {
      const schema = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "patient",
      );
      expect(schema.parameters.properties.agentType).toBeUndefined();
    });

    it("removes consentRequests from schema properties", () => {
      const schema = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "patient",
      );
      expect(schema.parameters.properties.consentRequests).toBeUndefined();
    });

    it("removes clarifyingQuestions from schema properties", () => {
      const schema = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "patient",
      );
      expect(schema.parameters.properties.clarifyingQuestions).toBeUndefined();
    });

    it("adds mode-specific patient properties from chatConfig", () => {
      const schema = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "patient",
      );
      expect(schema.parameters.properties.mood).toEqual({ type: "string" });
    });

    it("adds mode-specific clinical properties from chatConfig", () => {
      const schema = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "clinical",
      );
      expect(schema.parameters.properties.clinicalNotes).toEqual({
        type: "string",
      });
    });

    it("does not include toolCalls from mode additionalProperties", () => {
      // Even if a mode config somehow had toolCalls, it should be filtered out
      const schema = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "patient",
      );
      expect(schema.parameters.properties.toolCalls).toBeUndefined();
    });

    it("throws for unknown agent type", () => {
      expect(() =>
        chatAgentConfigManager.createSubAgentSchema("unknown" as any, "patient"),
      ).toThrow("Unknown sub-agent type: unknown");
    });

    it("returns independent copies on each call", () => {
      const schema1 = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "patient",
      );
      const schema2 = chatAgentConfigManager.createSubAgentSchema(
        "lab_results",
        "clinical",
      );
      expect(schema1).not.toBe(schema2);
    });
  });
});
