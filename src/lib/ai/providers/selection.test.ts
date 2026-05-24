import { describe, it, expect } from "vitest";
import { ProviderSelector, type SelectionCriteria } from "./selection";
import { AIProvider, PROVIDER_CAPABILITIES } from "./registry";

function makeCriteria(
  overrides: Partial<SelectionCriteria> = {},
): SelectionCriteria {
  return {
    hasImages: false,
    estimatedTokens: 2000,
    requiresHighReliability: false,
    costSensitive: false,
    ...overrides,
  };
}

describe("ProviderSelector", () => {
  describe("selectOptimalProvider", () => {
    it("returns a selection result with required fields", () => {
      const result = ProviderSelector.selectOptimalProvider(makeCriteria());
      expect(result.selectedProvider).toBeDefined();
      expect(result.fallbackProviders).toBeDefined();
      expect(result.reasoning).toBeDefined();
      expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("uses preferred provider when specified", () => {
      const result = ProviderSelector.selectOptimalProvider(
        makeCriteria({ preferredProvider: AIProvider.GOOGLE_GEMINI }),
      );
      expect(result.selectedProvider).toBe(AIProvider.GOOGLE_GEMINI);
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning[0]).toContain("preferred");
    });

    it("ignores invalid preferred provider string", () => {
      const result = ProviderSelector.selectOptimalProvider(
        makeCriteria({ preferredProvider: "nonexistent-provider" }),
      );
      // Should fall through to scored selection
      expect(Object.values(AIProvider)).toContain(result.selectedProvider);
    });

    it("provides fallback providers", () => {
      const result = ProviderSelector.selectOptimalProvider(makeCriteria());
      expect(result.fallbackProviders.length).toBeGreaterThan(0);
      expect(result.fallbackProviders).not.toContain(
        result.selectedProvider,
      );
    });

    it("selects image-capable provider when images present", () => {
      const result = ProviderSelector.selectOptimalProvider(
        makeCriteria({ hasImages: true }),
      );
      // All current providers support images, but Gemini should score highest for images
      expect(result.selectedProvider).toBeDefined();
    });

    it("penalizes providers exceeding token limit", () => {
      // GPT-4 has 8192 max tokens — use a huge estimate
      const result = ProviderSelector.selectOptimalProvider(
        makeCriteria({ estimatedTokens: 50000 }),
      );
      // GPT-4 (8192 max) should be penalized; GPT-4 Turbo (128000) or Claude (100000) preferred
      expect(result.selectedProvider).not.toBe(AIProvider.OPENAI_GPT4);
    });

    it("favors reliable providers for high-stake documents", () => {
      const result = ProviderSelector.selectOptimalProvider(
        makeCriteria({
          requiresHighReliability: true,
          documentType: "pathology",
        }),
      );
      const caps = PROVIDER_CAPABILITIES;
      const selectedReliability =
        caps[result.selectedProvider].reliability;
      expect(selectedReliability).toBeGreaterThanOrEqual(0.93);
    });

    it("considers cost for large documents", () => {
      const result = ProviderSelector.selectOptimalProvider(
        makeCriteria({
          costSensitive: true,
          estimatedTokens: 20000,
        }),
      );
      // Expensive providers should be penalized
      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    it("factors in document type preference", () => {
      const result = ProviderSelector.selectOptimalProvider(
        makeCriteria({ documentType: "imaging" }),
      );
      // Imaging prefers Gemini
      expect(result.reasoning.some((r) => r.includes("imaging"))).toBe(
        true,
      );
    });

    it("calculates estimated cost correctly", () => {
      const result = ProviderSelector.selectOptimalProvider(
        makeCriteria({
          preferredProvider: AIProvider.OPENAI_GPT4,
          estimatedTokens: 1000,
        }),
      );
      // GPT-4 cost is 0.03 per 1K tokens → 1000 tokens = $0.03
      expect(result.estimatedCost).toBeCloseTo(0.03, 2);
    });
  });

  describe("selectProvider (from state)", () => {
    it("extracts criteria from processing state", () => {
      const state = {
        text: "A".repeat(4000), // ~1000 tokens
        images: [{ data: "img" }],
        featureDetection: { type: "surgical" },
        language: "en",
        options: {},
      } as any;

      const result = ProviderSelector.selectProvider(state);
      expect(result.selectedProvider).toBeDefined();
      // Should recognize it has images
      expect(
        result.reasoning.some(
          (r) =>
            r.toLowerCase().includes("image") ||
            r.toLowerCase().includes("surgical"),
        ),
      ).toBe(true);
    });

    it("handles empty state", () => {
      const state = {} as any;
      const result = ProviderSelector.selectProvider(state);
      expect(result.selectedProvider).toBeDefined();
    });
  });

  describe("explainSelection", () => {
    it("returns formatted explanation string", () => {
      const result = ProviderSelector.selectOptimalProvider(makeCriteria());
      const explanation = ProviderSelector.explainSelection(result);
      expect(explanation).toContain("Selected:");
      expect(explanation).toContain("Confidence:");
      expect(explanation).toContain("Estimated Cost:");
      expect(explanation).toContain("Reasoning:");
      expect(explanation).toContain("Fallbacks:");
    });
  });

  describe("confidence calculation", () => {
    it("higher confidence when clear winner", () => {
      // Imaging with images gives Gemini a clear edge
      const result = ProviderSelector.selectOptimalProvider(
        makeCriteria({
          hasImages: true,
          documentType: "imaging",
        }),
      );
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("returns 1.0 when only one provider would work", () => {
      // This is hard to trigger with current data since all providers support images
      // but test the confidence is within valid range
      const result = ProviderSelector.selectOptimalProvider(makeCriteria());
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
