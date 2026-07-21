import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSearchDocuments } = vi.hoisted(() => ({
  mockSearchDocuments: vi.fn(),
}));

vi.mock("$lib/config/classification", () => ({
  classificationConfig: {
    categories: {
      lab: { id: "lab", keywords: ["blood", "test", "hemoglobin"] },
      medication: { id: "medication", keywords: ["aspirin", "ibuprofen"] },
    },
    temporalTerms: {
      recent: { type: "recent", examples: ["last month", "recently"] },
      historical: { type: "historical", examples: ["years ago"] },
    },
  },
}));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("../../mcp-tools/medical-expert-tools", () => ({
  medicalExpertTools: { searchDocuments: mockSearchDocuments },
  mcpTools: {},
}));

vi.mock("../shared/chat-context-base", () => ({
  BaseChatContextService: class {
    createEmptyContextResult() {
      return {
        assembledContext: undefined,
        availableTools: [],
        contextSummary: "No relevant medical context found.",
        documentCount: 0,
        confidence: 0,
        tokenUsage: 0,
      };
    }
  },
}));

import { ServerChatContextService } from "./chat-context-server";

describe("ServerChatContextService", () => {
  let service: ServerChatContextService;

  beforeEach(() => {
    service = new ServerChatContextService();
    mockSearchDocuments.mockReset();
  });

  describe("extractMedicalTermsFromQuery", () => {
    it('returns lab category and blood/test terms for "blood test"', () => {
      const result = (service as any).extractMedicalTermsFromQuery("blood test");
      expect(result.medicalTerms).toContain("blood");
      expect(result.medicalTerms).toContain("test");
      expect(result.categories).toContain("lab");
    });

    it('returns medication category and aspirin term for "aspirin medication"', () => {
      const result = (service as any).extractMedicalTermsFromQuery("aspirin medication");
      expect(result.medicalTerms).toContain("aspirin");
      expect(result.categories).toContain("medication");
    });

    it('returns temporalType "recent" and includes "last month" for "last month hemoglobin"', () => {
      const result = (service as any).extractMedicalTermsFromQuery("last month hemoglobin");
      expect(result.temporalType).toBe("recent");
      expect(result.medicalTerms).toContain("last month");
    });

    it('returns empty medicalTerms when query contains only stop words', () => {
      const result = (service as any).extractMedicalTermsFromQuery("the and or");
      expect(result.medicalTerms).toHaveLength(0);
    });

    it('includes plain non-stop words as medical terms for "unknown symptom"', () => {
      const result = (service as any).extractMedicalTermsFromQuery("unknown symptom");
      expect(result.medicalTerms).toContain("unknown");
      expect(result.medicalTerms).toContain("symptom");
    });

    it("deduplicates terms (no duplicates in result)", () => {
      // "blood" matches the keyword and also gets picked up as a plain word
      const result = (service as any).extractMedicalTermsFromQuery("blood blood");
      const bloodCount = result.medicalTerms.filter((t: string) => t === "blood").length;
      expect(bloodCount).toBe(1);
    });
  });

  describe("generateQueryEmbedding", () => {
    it("returns a Float32Array", async () => {
      const result = await (service as any).generateQueryEmbedding("some query");
      expect(result).toBeInstanceOf(Float32Array);
    });

    it("returns an empty Float32Array (length 0)", async () => {
      const result = await (service as any).generateQueryEmbedding("some query");
      expect(result).toHaveLength(0);
    });
  });

  describe("prepareContextForChat", () => {
    it("returns empty context result when searchDocuments returns isError", async () => {
      mockSearchDocuments.mockResolvedValue({ isError: true, content: null });

      const result = await service.prepareContextForChat("blood test", {});

      expect(result.documentCount).toBe(0);
      expect(result.assembledContext).toBeUndefined();
      expect(result.contextSummary).toBe("No relevant medical context found.");
    });

    it("returns context result with documentCount when documents found", async () => {
      mockSearchDocuments.mockResolvedValue({
        isError: false,
        content: [
          {
            type: "resource",
            resource: {
              documents: [
                { id: "1", summary: "Blood test result", relevance: 0.9, date: "2025-01-01", type: "lab" },
                { id: "2", summary: "CBC panel", relevance: 0.8, date: "2025-02-01", type: "lab" },
              ],
            },
          },
        ],
      });

      const result = await service.prepareContextForChat("blood test", {});

      expect(result.documentCount).toBe(2);
      expect(result.assembledContext).toBeDefined();
    });

    it("returns empty context when documents array is empty", async () => {
      mockSearchDocuments.mockResolvedValue({
        isError: false,
        content: [
          {
            type: "resource",
            resource: { documents: [] },
          },
        ],
      });

      const result = await service.prepareContextForChat("blood test", {});

      expect(result.documentCount).toBe(0);
      expect(result.assembledContext).toBeUndefined();
      expect(result.contextSummary).toBe("No relevant medical context found.");
    });

    it("returns empty context on exception (error handling)", async () => {
      mockSearchDocuments.mockRejectedValue(new Error("Network failure"));

      const result = await service.prepareContextForChat("blood test", {});

      expect(result.documentCount).toBe(0);
      expect(result.assembledContext).toBeUndefined();
    });
  });
});
