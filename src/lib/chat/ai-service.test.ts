import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAnalyzeDocument, mockDetectBodyParts, mockSuggestAnatomyView, mockCreateResponseSchema, mockGetLanguageEnglishName, mockPrepareContext, mockCreateContextAwareSystemPrompt, mockGenerateId } = vi.hoisted(() => ({
  mockAnalyzeDocument: vi.fn(),
  mockDetectBodyParts: vi.fn().mockReturnValue([]),
  mockSuggestAnatomyView: vi.fn().mockReturnValue(null),
  mockCreateResponseSchema: vi.fn().mockReturnValue({ parameters: { properties: {} } }),
  mockGetLanguageEnglishName: vi.fn().mockReturnValue("English"),
  mockPrepareContext: vi.fn().mockResolvedValue({ assembledContext: null, availableTools: [], documentCount: 0, confidence: 0, contextSummary: "" }),
  mockCreateContextAwareSystemPrompt: vi.fn().mockImplementation((base: string) => base),
  mockGenerateId: vi.fn().mockReturnValue("id-1"),
}));

vi.mock("$lib/ai/providers/enhanced-abstraction", () => ({
  enhancedAIProvider: {
    analyzeDocument: mockAnalyzeDocument,
  },
}));

vi.mock("./anatomy-integration", () => ({
  default: {
    detectBodyParts: mockDetectBodyParts,
    suggestAnatomyView: mockSuggestAnatomyView,
    processResponse: vi.fn().mockReturnValue(null),
  },
}));

vi.mock("$lib/utils/id", () => ({ generateId: mockGenerateId }));
vi.mock("$lib/languages", () => ({ getLanguageEnglishName: mockGetLanguageEnglishName }));

vi.mock("$lib/context/integration/chat-service", () => ({
  chatContextService: {
    prepareContextForChat: mockPrepareContext,
    createContextAwareSystemPrompt: mockCreateContextAwareSystemPrompt,
    getMCPToolsForChat: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("$lib/config/chat-config", () => ({
  chatConfigManager: {
    createResponseSchema: mockCreateResponseSchema,
    buildSystemPrompt: vi.fn().mockReturnValue("system prompt"),
  },
}));

import { ChatAIService } from "./ai-service";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<any> = {}): any {
  return {
    mode: "patient",
    currentProfileId: "profile-1",
    conversationThreadId: "thread-1",
    language: "en",
    isOwnProfile: true,
    pageContext: {
      route: "/",
      profileName: "Alice",
      availableData: { documents: [], conditions: [], medications: [], vitals: [] },
    },
    ...overrides,
  };
}

describe("chat/ai-service — ChatAIService", () => {
  let service: ChatAIService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzeDocument.mockResolvedValue({
      response: "AI response",
      documentReferences: [],
      toolCalls: [],
      consentRequests: [],
    });
    mockDetectBodyParts.mockReturnValue([]);
    mockSuggestAnatomyView.mockReturnValue(null);
    mockCreateResponseSchema.mockReturnValue({ parameters: { properties: {} } });
    mockCreateContextAwareSystemPrompt.mockImplementation((base: string) => base);
    service = new ChatAIService();
  });

  // ── processMessage ────────────────────────────────────────────────────────

  describe("processMessage", () => {
    it("returns a ChatResponse with message", async () => {
      const result = await service.processMessage("Hello", makeContext(), []);
      expect(result).toHaveProperty("message");
      expect(typeof result.message).toBe("string");
    });

    it("uses AI provider to generate response", async () => {
      await service.processMessage("Hello", makeContext(), []);
      expect(mockAnalyzeDocument).toHaveBeenCalledOnce();
    });

    it("includes anatomyReferences from detected body parts", async () => {
      mockDetectBodyParts.mockReturnValue([{ bodyPartId: "heart", score: 0.9 }]);
      const result = await service.processMessage("chest pain", makeContext(), []);
      expect(result.anatomyReferences).toContain("heart");
    });

    it("includes anatomy suggestion when one is returned", async () => {
      mockSuggestAnatomyView.mockReturnValue({ suggestion: "View the heart model" });
      const result = await service.processMessage("heart", makeContext(), []);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions![0].suggestion).toBe("View the heart model");
    });

    it("returns empty arrays when no anatomy or tools", async () => {
      const result = await service.processMessage("Hello", makeContext(), []);
      expect(result.anatomyReferences).toEqual([]);
      expect(result.suggestions).toEqual([]);
    });

    it("handles AI error gracefully", async () => {
      mockAnalyzeDocument.mockRejectedValue(new Error("AI failed"));
      const result = await service.processMessage("Hello", makeContext(), []);
      expect(result.message).toContain("error");
      expect(result.anatomyReferences).toEqual([]);
    });

    it("creates schema for patient mode", async () => {
      await service.processMessage("Hello", makeContext({ mode: "patient" }), []);
      expect(mockCreateResponseSchema).toHaveBeenCalledWith("patient");
    });

    it("creates schema for clinical mode", async () => {
      await service.processMessage("Hello", makeContext({ mode: "clinical" }), []);
      expect(mockCreateResponseSchema).toHaveBeenCalledWith("clinical");
    });

    it("returns document references from AI response", async () => {
      mockAnalyzeDocument.mockResolvedValue({
        response: "Found info",
        documentReferences: ["doc-1"],
        toolCalls: [],
        consentRequests: [],
      });
      const result = await service.processMessage("docs?", makeContext(), []);
      expect(result.documentReferences).toContain("doc-1");
    });

    it("returns tool calls from AI response", async () => {
      mockAnalyzeDocument.mockResolvedValue({
        response: "Using tool",
        documentReferences: [],
        toolCalls: [{ name: "searchDocuments", parameters: {} }],
        consentRequests: [],
      });
      const result = await service.processMessage("search", makeContext(), []);
      expect(result.toolCalls).toHaveLength(1);
    });

    it("includes recent conversation history in content", async () => {
      const history = [
        { role: "user" as const, content: "Hi", id: "1", timestamp: new Date() },
        { role: "assistant" as const, content: "Hello", id: "2", timestamp: new Date() },
      ];
      await service.processMessage("More context", makeContext(), history);
      const contentArg = mockAnalyzeDocument.mock.calls[0][0];
      const contentStr = contentArg.map((c: any) => c.text).join(" ");
      expect(contentStr).toContain("Hi");
    });

    it("includes assembled context in content when provided", async () => {
      const ctx = makeContext({
        assembledContext: {
          summary: "Patient has hypertension",
          keyPoints: [],
          relevantDocuments: [],
          confidence: 0.8,
          tokenCount: 100,
        },
      });
      await service.processMessage("Hello", ctx, []);
      const contentArg = mockAnalyzeDocument.mock.calls[0][0];
      const contentStr = contentArg.map((c: any) => c.text).join(" ");
      expect(contentStr).toContain("hypertension");
    });

    it("uses aiResponse.message as fallback when response is missing", async () => {
      mockAnalyzeDocument.mockResolvedValue({
        message: "fallback response",
        documentReferences: [],
        toolCalls: [],
        consentRequests: [],
      });
      const result = await service.processMessage("Hi", makeContext(), []);
      expect(result.message).toBe("fallback response");
    });
  });

  // ── formatResponse ────────────────────────────────────────────────────────

  describe("formatResponse", () => {
    it("returns the message when no suggestions or consents", () => {
      const formatted = service.formatResponse({
        message: "Hello",
        anatomyReferences: [],
      });
      expect(formatted).toBe("Hello");
    });

    it("appends suggestions to the message", () => {
      const formatted = service.formatResponse({
        message: "Hello",
        anatomyReferences: [],
        suggestions: [{ suggestion: "View heart model", bodyParts: [], actionText: "" }],
      });
      expect(formatted).toContain("Hello");
      expect(formatted).toContain("View heart model");
    });

    it("appends consent requests to message", () => {
      const formatted = service.formatResponse({
        message: "Need access",
        anatomyReferences: [],
        consentRequests: [{ message: "Please approve tool use", type: "document_access" as const, reason: "" }],
      });
      expect(formatted).toContain("Please approve tool use");
    });

    it("appends both suggestions and consent requests", () => {
      const formatted = service.formatResponse({
        message: "Info",
        anatomyReferences: [],
        suggestions: [{ suggestion: "Anatomy view", bodyParts: [], actionText: "" }],
        consentRequests: [{ message: "Approve", type: "document_access" as const, reason: "" }],
      });
      expect(formatted).toContain("Anatomy view");
      expect(formatted).toContain("Approve");
    });
  });
});
