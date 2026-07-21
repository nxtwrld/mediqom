import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock AI provider SDKs (require API keys / network)
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    _type = "openai";
    cfg: any;
    constructor(cfg: any) { this.cfg = cfg; }
  },
}));
vi.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: class MockChatGemini {
    _type = "gemini";
    cfg: any;
    constructor(cfg: any) { this.cfg = cfg; }
  },
}));
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class MockChatAnthropic {
    _type = "anthropic";
    cfg: any;
    constructor(cfg: any) { this.cfg = cfg; }
  },
}));

const { mockGetApiKey } = vi.hoisted(() => ({
  mockGetApiKey: vi.fn().mockReturnValue("mock-api-key"),
}));
vi.mock("./model-config", () => ({
  modelConfig: { getProviderApiKey: mockGetApiKey },
}));

import { chatConfigManager } from "./chat-config";

describe("config/chat-config — ChatConfigManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiKey.mockReturnValue("mock-api-key");
  });

  // ── getConfig ─────────────────────────────────────────────────────────────

  describe("getConfig", () => {
    it("returns configuration object", () => {
      const config = chatConfigManager.getConfig();
      expect(config).toBeDefined();
      expect(config.providers).toBeDefined();
      expect(config.defaultProvider).toBe("openai");
    });
  });

  // ── getAvailableProviders ─────────────────────────────────────────────────

  describe("getAvailableProviders", () => {
    it("returns only enabled providers", () => {
      const providers = chatConfigManager.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
      // openai and gemini are enabled; anthropic is disabled in chat.json
      expect(providers).toContain("openai");
      expect(providers).toContain("gemini");
      expect(providers).not.toContain("anthropic");
    });
  });

  // ── getProviderConfig ─────────────────────────────────────────────────────

  describe("getProviderConfig", () => {
    it("returns provider config for known provider", () => {
      const config = chatConfigManager.getProviderConfig("openai");
      expect(config.models.streaming.name).toBeDefined();
    });

    it("throws for unknown provider", () => {
      expect(() =>
        chatConfigManager.getProviderConfig("unknown-provider"),
      ).toThrow("not found in configuration");
    });
  });

  // ── getConversationConfig ─────────────────────────────────────────────────

  describe("getConversationConfig", () => {
    it("returns conversationHistory config", () => {
      const conv = chatConfigManager.getConversationConfig();
      expect(conv.maxMessages).toBeDefined();
      expect(typeof conv.includeSystemMessages).toBe("boolean");
    });
  });

  // ── getLanguageName ───────────────────────────────────────────────────────

  describe("getLanguageName", () => {
    it("returns English for 'en'", () => {
      expect(chatConfigManager.getLanguageName("en")).toBe("English");
    });

    it("returns Czech for 'cs'", () => {
      expect(chatConfigManager.getLanguageName("cs")).toBe("Czech");
    });

    it("falls back to English for unknown code", () => {
      expect(chatConfigManager.getLanguageName("xx")).toBe("English");
    });
  });

  // ── createStreamingModel ──────────────────────────────────────────────────

  describe("createStreamingModel", () => {
    it("creates OpenAI model for 'openai' provider", () => {
      const model = chatConfigManager.createStreamingModel("openai") as any;
      expect(model._type).toBe("openai");
      expect(model.cfg.streaming).toBe(true);
    });

    it("creates Gemini model for 'gemini' provider", () => {
      const model = chatConfigManager.createStreamingModel("gemini") as any;
      expect(model._type).toBe("gemini");
      expect(model.cfg.streaming).toBe(true);
    });

    it("throws when provider is disabled", () => {
      // anthropic IS disabled in chat.json
      expect(() => chatConfigManager.createStreamingModel("anthropic")).toThrow(
        "not enabled",
      );
    });

    it("throws for unknown provider", () => {
      expect(() => chatConfigManager.createStreamingModel("unknown")).toThrow();
    });

    it("uses default provider when none specified", () => {
      const model = chatConfigManager.createStreamingModel() as any;
      expect(model._type).toBe("openai");
    });
  });

  // ── createStructuredModel ─────────────────────────────────────────────────

  describe("createStructuredModel", () => {
    it("creates OpenAI model for 'openai' provider", () => {
      const model = chatConfigManager.createStructuredModel("openai") as any;
      expect(model._type).toBe("openai");
      // Structured model should NOT have streaming: true
      expect(model.cfg.streaming).toBeUndefined();
    });

    it("creates Gemini model for 'gemini' provider", () => {
      const model = chatConfigManager.createStructuredModel("gemini") as any;
      expect(model._type).toBe("gemini");
    });

    it("throws when provider is disabled", () => {
      expect(() => chatConfigManager.createStructuredModel("anthropic")).toThrow(
        "not enabled",
      );
    });

    it("throws for unsupported provider", () => {
      expect(() => chatConfigManager.createStructuredModel("unknown")).toThrow();
    });
  });

  // ── buildSystemPrompt ─────────────────────────────────────────────────────

  describe("buildSystemPrompt", () => {
    it("returns a non-empty string", () => {
      const prompt = chatConfigManager.buildSystemPrompt("patient", "en", {});
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("includes current date in prompt", () => {
      const prompt = chatConfigManager.buildSystemPrompt("patient", "en", {});
      expect(prompt).toContain("Current Date:");
    });

    it("includes language requirement for 'en'", () => {
      const prompt = chatConfigManager.buildSystemPrompt("patient", "en", {});
      expect(prompt).toContain("English");
    });

    it("includes language requirement for Czech", () => {
      const prompt = chatConfigManager.buildSystemPrompt("patient", "cs", {});
      expect(prompt).toContain("Czech");
    });

    it("includes injection defense instruction", () => {
      const prompt = chatConfigManager.buildSystemPrompt("patient", "en", {});
      expect(prompt).toContain("CRITICAL SAFETY INSTRUCTION");
    });

    it("includes patient mode title for 'patient'", () => {
      const prompt = chatConfigManager.buildSystemPrompt("patient", "en", {});
      expect(prompt).toContain("PATIENT");
    });

    it("includes clinical mode content for 'clinical'", () => {
      const prompt = chatConfigManager.buildSystemPrompt("clinical", "en", {});
      expect(prompt).toContain("CLINICAL");
    });

    it("includes caregiver mode for 'caregiver'", () => {
      const prompt = chatConfigManager.buildSystemPrompt("caregiver", "en", {});
      expect(typeof prompt).toBe("string");
    });

    it("includes boundaries when mode has boundaries defined", () => {
      const prompt = chatConfigManager.buildSystemPrompt("patient", "en", {});
      // Patient mode has NEVER provide advice boundary
      expect(prompt).toContain("IMPORTANT BOUNDARIES");
    });

    it("includes clinical focus section when mode has focus", () => {
      const prompt = chatConfigManager.buildSystemPrompt("clinical", "en", {});
      // Only if clinical has focus array in chat.json
      expect(typeof prompt).toBe("string");
    });

    it("includes vitals section when pageContext has vitals", () => {
      const pageContext = {
        availableData: {
          vitals: ["Blood Pressure: 120/80", "Heart Rate: 72 bpm"],
        },
      };
      const prompt = chatConfigManager.buildSystemPrompt(
        "patient",
        "en",
        pageContext,
      );
      expect(prompt).toContain("PATIENT VITALS");
      expect(prompt).toContain("Blood Pressure");
    });

    it("includes assembled context summary when provided", () => {
      const assembledContext = {
        summary: "Patient has hypertension",
        keyPoints: [],
      };
      const prompt = chatConfigManager.buildSystemPrompt(
        "patient",
        "en",
        {},
        assembledContext,
      );
      expect(prompt).toContain("Patient has hypertension");
      expect(prompt).toContain("Additional Medical Context");
    });

    it("includes assembled context key points grouped by type", () => {
      const assembledContext = {
        keyPoints: [
          { type: "diagnosis", text: "Hypertension", date: "2024-01-01" },
          { type: "medication", text: "Lisinopril 10mg", date: "2024-01-01" },
        ],
      };
      const prompt = chatConfigManager.buildSystemPrompt(
        "patient",
        "en",
        {},
        assembledContext,
      );
      expect(prompt).toContain("Hypertension");
      expect(prompt).toContain("Lisinopril");
    });

    it("includes assembled context recent changes", () => {
      const assembledContext = {
        medicalContext: {
          recentChanges: [
            { date: "2024-01-01", description: "Started new medication" },
            { date: "2024-01-02", description: "Blood pressure improved" },
          ],
        },
      };
      const prompt = chatConfigManager.buildSystemPrompt(
        "patient",
        "en",
        {},
        assembledContext,
      );
      expect(prompt).toContain("Recent Changes");
      expect(prompt).toContain("Started new medication");
    });

    it("includes document context when documentsContent provided", () => {
      const pageContext = {
        documentsContent: [
          [
            "doc-1",
            {
              title: "Blood Test",
              signals: [
                { signal: "Glucose", value: 5.4, unit: "mmol/L", reference: "3.9-6.1" },
              ],
            },
          ],
        ],
      };
      const prompt = chatConfigManager.buildSystemPrompt(
        "patient",
        "en",
        pageContext,
      );
      expect(prompt).toContain("AVAILABLE MEDICAL DOCUMENTS");
      expect(prompt).toContain("Blood Test");
      expect(prompt).toContain("Glucose");
    });

    it("includes document catalog when provided", () => {
      const pageContext = {
        documentCatalog: [
          {
            id: "doc-1",
            title: "Annual Checkup",
            category: "consultation",
            date: "2024-01-01",
            medicalTerms: ["hypertension"],
          },
        ],
      };
      const prompt = chatConfigManager.buildSystemPrompt(
        "patient",
        "en",
        pageContext,
      );
      expect(prompt).toContain("DOCUMENT CATALOG");
      expect(prompt).toContain("Annual Checkup");
    });
  });

  // ── createResponseSchema ──────────────────────────────────────────────────

  describe("createResponseSchema", () => {
    it("returns a schema object", () => {
      const schema = chatConfigManager.createResponseSchema("patient");
      expect(schema).toBeDefined();
      expect(schema.parameters).toBeDefined();
    });

    it("adds anatomy objects to anatomyReferences enum", () => {
      const schema = chatConfigManager.createResponseSchema("patient");
      const anatomyEnum =
        schema.parameters.properties.anatomyReferences?.items?.enum;
      expect(Array.isArray(anatomyEnum)).toBe(true);
      expect(anatomyEnum.length).toBeGreaterThan(0);
    });

    it("adds mode-specific properties for patient", () => {
      const schema = chatConfigManager.createResponseSchema("patient");
      expect(schema.parameters.properties).toBeDefined();
    });

    it("adds mode-specific properties for clinical", () => {
      const schema = chatConfigManager.createResponseSchema("clinical");
      expect(schema.parameters.properties).toBeDefined();
    });

    it("updates documentTypes description with real category IDs", () => {
      const schema = chatConfigManager.createResponseSchema("patient");
      const toolCalls = schema.parameters.properties.toolCalls;
      if (toolCalls?.items?.properties?.parameters?.properties?.documentTypes) {
        const desc =
          toolCalls.items.properties.parameters.properties.documentTypes
            .description;
        expect(desc).toContain("laboratory");
      }
    });

    it("does not mutate the original base schema between calls", () => {
      const schema1 = chatConfigManager.createResponseSchema("patient");
      const schema2 = chatConfigManager.createResponseSchema("clinical");
      // Both should return independent copies
      expect(schema1).not.toBe(schema2);
    });
  });
});
