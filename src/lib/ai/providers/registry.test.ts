import { describe, it, expect } from "vitest";
import {
  AIProvider,
  ProviderRegistry,
  PROVIDER_CAPABILITIES,
  DOCUMENT_TYPE_MAPPINGS,
} from "./registry";

describe("AIProvider enum", () => {
  it("has all expected providers", () => {
    expect(AIProvider.OPENAI_GPT4).toBe("openai-gpt4");
    expect(AIProvider.OPENAI_GPT4_TURBO).toBe("openai-gpt4-turbo");
    expect(AIProvider.ANTHROPIC_CLAUDE).toBe("anthropic-claude");
    expect(AIProvider.GOOGLE_GEMINI).toBe("google-gemini");
  });
});

describe("PROVIDER_CAPABILITIES", () => {
  it("has capabilities for every provider", () => {
    for (const provider of Object.values(AIProvider)) {
      expect(PROVIDER_CAPABILITIES[provider]).toBeDefined();
    }
  });

  it("all providers have valid reliability range", () => {
    for (const provider of Object.values(AIProvider)) {
      const caps = PROVIDER_CAPABILITIES[provider];
      expect(caps.reliability).toBeGreaterThanOrEqual(0);
      expect(caps.reliability).toBeLessThanOrEqual(1);
    }
  });

  it("all providers have positive cost and maxTokens", () => {
    for (const provider of Object.values(AIProvider)) {
      const caps = PROVIDER_CAPABILITIES[provider];
      expect(caps.cost).toBeGreaterThan(0);
      expect(caps.maxTokens).toBeGreaterThan(0);
    }
  });

  it("GPT-4 Turbo has the largest context window", () => {
    expect(PROVIDER_CAPABILITIES[AIProvider.OPENAI_GPT4_TURBO].maxTokens).toBe(
      128000,
    );
  });

  it("Gemini is the cheapest provider", () => {
    const geminiCost = PROVIDER_CAPABILITIES[AIProvider.GOOGLE_GEMINI].cost;
    for (const provider of Object.values(AIProvider)) {
      expect(PROVIDER_CAPABILITIES[provider].cost).toBeGreaterThanOrEqual(
        geminiCost,
      );
    }
  });
});

describe("DOCUMENT_TYPE_MAPPINGS", () => {
  it("is a non-empty array", () => {
    expect(DOCUMENT_TYPE_MAPPINGS.length).toBeGreaterThan(0);
  });

  it("each mapping has documentType and preferredProviders", () => {
    for (const mapping of DOCUMENT_TYPE_MAPPINGS) {
      expect(mapping.documentType).toBeTruthy();
      expect(mapping.preferredProviders.length).toBeGreaterThan(0);
    }
  });

  it("imaging prefers Gemini (image-strong)", () => {
    const imaging = DOCUMENT_TYPE_MAPPINGS.find(
      (m) => m.documentType === "imaging",
    );
    expect(imaging?.preferredProviders[0]).toBe(AIProvider.GOOGLE_GEMINI);
  });

  it("pathology prefers Claude (detailed analysis)", () => {
    const path = DOCUMENT_TYPE_MAPPINGS.find(
      (m) => m.documentType === "pathology",
    );
    expect(path?.preferredProviders[0]).toBe(AIProvider.ANTHROPIC_CLAUDE);
  });
});

describe("ProviderRegistry", () => {
  describe("getCapabilities", () => {
    it("returns capabilities for known provider", () => {
      const caps = ProviderRegistry.getCapabilities(AIProvider.OPENAI_GPT4);
      expect(caps.reliability).toBe(0.95);
      expect(caps.supportsImages).toBe(true);
    });
  });

  describe("getAllProviders", () => {
    it("returns all 4 providers", () => {
      const providers = ProviderRegistry.getAllProviders();
      expect(providers.length).toBe(4);
      expect(providers).toContain(AIProvider.OPENAI_GPT4);
      expect(providers).toContain(AIProvider.GOOGLE_GEMINI);
    });
  });

  describe("getImageCapableProviders", () => {
    it("returns providers with image support", () => {
      const providers = ProviderRegistry.getImageCapableProviders();
      expect(providers.length).toBeGreaterThan(0);
      for (const p of providers) {
        expect(
          ProviderRegistry.getCapabilities(p).supportsImages,
        ).toBe(true);
      }
    });
  });

  describe("getProvidersByCost", () => {
    it("returns providers sorted ascending by default", () => {
      const providers = ProviderRegistry.getProvidersByCost();
      const costs = providers.map(
        (p) => ProviderRegistry.getCapabilities(p).cost,
      );
      for (let i = 1; i < costs.length; i++) {
        expect(costs[i]).toBeGreaterThanOrEqual(costs[i - 1]);
      }
    });

    it("returns providers sorted descending when specified", () => {
      const providers = ProviderRegistry.getProvidersByCost(false);
      const costs = providers.map(
        (p) => ProviderRegistry.getCapabilities(p).cost,
      );
      for (let i = 1; i < costs.length; i++) {
        expect(costs[i]).toBeLessThanOrEqual(costs[i - 1]);
      }
    });
  });

  describe("getProvidersByReliability", () => {
    it("returns providers sorted descending by default", () => {
      const providers = ProviderRegistry.getProvidersByReliability();
      const reliabilities = providers.map(
        (p) => ProviderRegistry.getCapabilities(p).reliability,
      );
      for (let i = 1; i < reliabilities.length; i++) {
        expect(reliabilities[i]).toBeLessThanOrEqual(reliabilities[i - 1]);
      }
    });

    it("returns providers sorted ascending when specified", () => {
      const providers = ProviderRegistry.getProvidersByReliability(false);
      const reliabilities = providers.map(
        (p) => ProviderRegistry.getCapabilities(p).reliability,
      );
      for (let i = 1; i < reliabilities.length; i++) {
        expect(reliabilities[i]).toBeGreaterThanOrEqual(reliabilities[i - 1]);
      }
    });
  });

  describe("hasStrength", () => {
    it("returns true for known strength", () => {
      expect(
        ProviderRegistry.hasStrength(
          AIProvider.OPENAI_GPT4,
          "medical_terminology",
        ),
      ).toBe(true);
    });

    it("returns false for non-strength", () => {
      expect(
        ProviderRegistry.hasStrength(
          AIProvider.OPENAI_GPT4,
          "image_analysis",
        ),
      ).toBe(false);
    });
  });

  describe("hasWeakness", () => {
    it("returns true for known weakness", () => {
      expect(
        ProviderRegistry.hasWeakness(
          AIProvider.OPENAI_GPT4,
          "image_analysis",
        ),
      ).toBe(true);
    });

    it("returns false for non-weakness", () => {
      expect(
        ProviderRegistry.hasWeakness(
          AIProvider.OPENAI_GPT4,
          "general_medical",
        ),
      ).toBe(false);
    });
  });

  describe("getDocumentTypeMapping", () => {
    it("returns mapping for known document type", () => {
      const mapping = ProviderRegistry.getDocumentTypeMapping("imaging");
      expect(mapping).toBeDefined();
      expect(mapping!.documentType).toBe("imaging");
    });

    it("returns undefined for unknown document type", () => {
      expect(
        ProviderRegistry.getDocumentTypeMapping("unknown"),
      ).toBeUndefined();
    });
  });

  describe("getPreferredProviders", () => {
    it("returns preferred providers for known type", () => {
      const providers =
        ProviderRegistry.getPreferredProviders("surgical");
      expect(providers).toContain(AIProvider.ANTHROPIC_CLAUDE);
    });

    it("defaults to GPT-4 for unknown type", () => {
      const providers =
        ProviderRegistry.getPreferredProviders("unknown_type");
      expect(providers).toEqual([AIProvider.OPENAI_GPT4]);
    });
  });
});
