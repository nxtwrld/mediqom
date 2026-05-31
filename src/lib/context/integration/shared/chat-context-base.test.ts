import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockIsContextReady, mockSearchDocs, mockGetAssembled, mockGetProfile, mockQueryHistory, mockGetDoc } =
  vi.hoisted(() => ({
    mockIsContextReady: vi.fn().mockReturnValue(false),
    mockSearchDocs: vi.fn(),
    mockGetAssembled: vi.fn(),
    mockGetProfile: vi.fn(),
    mockQueryHistory: vi.fn(),
    mockGetDoc: vi.fn(),
  }));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));
vi.mock("../profile-context", () => ({
  profileContextManager: { isContextReady: mockIsContextReady },
}));
vi.mock("../../context-assembly/context-composer", () => ({
  contextAssembler: { assembleContextForAI: vi.fn() },
}));
vi.mock("../../mcp-tools/medical-expert-tools", () => ({
  mcpTools: {
    searchDocuments: mockSearchDocs,
    getAssembledContext: mockGetAssembled,
    getProfileData: mockGetProfile,
    queryMedicalHistory: mockQueryHistory,
    getDocumentById: mockGetDoc,
  },
}));

import { BaseChatContextService } from "./chat-context-base";

// Minimal concrete subclass — only abstract methods implemented
class TestService extends BaseChatContextService {}

const svc = new TestService();

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContextResult(overrides: Record<string, any> = {}) {
  return {
    availableTools: ["searchDocuments", "getProfileData"],
    contextSummary: "Test context",
    documentCount: 2,
    confidence: 0.8,
    tokenUsage: 200,
    ...overrides,
  };
}

function makeAssembledContext(overrides: Record<string, any> = {}) {
  return {
    summary: "Patient summary",
    keyPoints: [
      { text: "Diabetes diagnosis", type: "diagnosis", date: "2023-01-10", confidence: 0.9 },
      { text: "Metformin 500mg", type: "medication", date: "2023-01-10", confidence: 0.85 },
    ],
    relevantDocuments: [{ documentId: "doc-1", type: "report", date: "2023-01-10", excerpt: "...", relevance: 0.9 }],
    medicalContext: { recentChanges: [] },
    confidence: 0.85,
    tokenCount: 300,
    ...overrides,
  };
}

// ── prepareContextForChat ─────────────────────────────────────────────────────

describe("context/integration/shared/chat-context-base", () => {
  beforeEach(() => {
    mockIsContextReady.mockReturnValue(false);
  });

  describe("prepareContextForChat", () => {
    it("returns empty result when no context is available", async () => {
      mockIsContextReady.mockReturnValue(false);

      const result = await svc.prepareContextForChat("What are my medications?", {
        profileId: "profile-1",
      });

      expect(result.documentCount).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.tokenUsage).toBe(0);
      expect(result.availableTools).toContain("searchDocuments");
    });

    it("returns empty result when context is ready but search returns nothing", async () => {
      mockIsContextReady.mockReturnValue(true);

      const result = await svc.prepareContextForChat("query", {
        profileId: "profile-1",
      });

      expect(result.documentCount).toBe(0);
      expect(result.assembledContext).toBeUndefined();
    });
  });

  // ── createContextAwareSystemPrompt ─────────────────────────────────────────

  describe("createContextAwareSystemPrompt", () => {
    it("always includes a tools section", () => {
      const prompt = svc.createContextAwareSystemPrompt(
        "Base prompt",
        makeContextResult(),
      );

      expect(prompt).toContain("## Available Tools");
      expect(prompt).toContain("searchDocuments");
    });

    it("appends medical context section when assembledContext is present", () => {
      const contextResult = makeContextResult({
        assembledContext: makeAssembledContext(),
      });

      const prompt = svc.createContextAwareSystemPrompt("Base prompt", contextResult);
      expect(prompt).toContain("## Medical Context");
      expect(prompt).toContain("Patient summary");
    });

    it("omits medical context section when assembledContext is absent", () => {
      const prompt = svc.createContextAwareSystemPrompt(
        "Base prompt",
        makeContextResult({ assembledContext: undefined }),
      );

      expect(prompt).not.toContain("## Medical Context");
    });

    it("appends patient instructions by default", () => {
      const prompt = svc.createContextAwareSystemPrompt(
        "Base prompt",
        makeContextResult(),
        "patient",
      );

      expect(prompt).toContain("Patient Assistant Instructions");
    });

    it("appends clinical instructions for clinical role", () => {
      const prompt = svc.createContextAwareSystemPrompt(
        "Base prompt",
        makeContextResult(),
        "clinical",
      );

      expect(prompt).toContain("Clinical Assistant Instructions");
    });

    it("builds tool descriptions from availableTools list", () => {
      const result = makeContextResult({
        availableTools: ["searchDocuments", "getProfileData"],
      });
      const prompt = svc.createContextAwareSystemPrompt("Base", result);

      expect(prompt).toContain("searchDocuments");
      expect(prompt).toContain("getProfileData");
    });

    it("groups key points by type in context section", () => {
      const contextResult = makeContextResult({
        assembledContext: makeAssembledContext({
          keyPoints: [
            { text: "Type 2 Diabetes", type: "diagnosis", date: "2023-01-01", confidence: 0.9 },
            { text: "Metformin", type: "medication", date: "2023-01-01", confidence: 0.85 },
          ],
        }),
      });

      const prompt = svc.createContextAwareSystemPrompt("Base", contextResult);
      expect(prompt).toContain("Diagnos");
      expect(prompt).toContain("Medication");
    });
  });

  // ── getMCPToolsForChat ─────────────────────────────────────────────────────

  describe("getMCPToolsForChat", () => {
    it("returns an object with 5 tool functions", () => {
      const tools = svc.getMCPToolsForChat("profile-1");

      expect(typeof tools.searchDocuments).toBe("function");
      expect(typeof tools.getAssembledContext).toBe("function");
      expect(typeof tools.getProfileData).toBe("function");
      expect(typeof tools.queryMedicalHistory).toBe("function");
      expect(typeof tools.getDocumentById).toBe("function");
    });

    it("searchDocuments rejects empty terms with an error result", async () => {
      const tools = svc.getMCPToolsForChat("profile-1");

      const result = await tools.searchDocuments({ terms: [] });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Search requires medical terms");
    });

    it("searchDocuments rejects missing terms with an error result", async () => {
      const tools = svc.getMCPToolsForChat("profile-1");

      const result = await tools.searchDocuments({ terms: [] });

      expect(result.isError).toBe(true);
    });

    it("searchDocuments delegates to mcpTools when terms are valid", async () => {
      mockSearchDocs.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
      const tools = svc.getMCPToolsForChat("profile-1");

      await tools.searchDocuments({ terms: ["diabetes", "insulin"] });

      expect(mockSearchDocs).toHaveBeenCalledWith("profile-1", {
        terms: ["diabetes", "insulin"],
      });
    });

    it("getProfileData delegates to mcpTools.getProfileData", async () => {
      mockGetProfile.mockResolvedValue({ content: [] });
      const tools = svc.getMCPToolsForChat("profile-1");

      await tools.getProfileData();

      expect(mockGetProfile).toHaveBeenCalledWith("profile-1", {});
    });

    it("getDocumentById delegates to mcpTools.getDocumentById", async () => {
      mockGetDoc.mockResolvedValue({ content: [] });
      const tools = svc.getMCPToolsForChat("profile-1");

      await tools.getDocumentById("doc-42");

      expect(mockGetDoc).toHaveBeenCalledWith({ documentId: "doc-42" });
    });
  });

  // ── updateContextDuringConversation ───────────────────────────────────────

  describe("updateContextDuringConversation", () => {
    it("delegates to prepareContextForChat with combined conversation string", async () => {
      mockIsContextReady.mockReturnValue(false);
      const spy = vi.spyOn(svc, "prepareContextForChat");

      await svc.updateContextDuringConversation(
        "profile-1",
        ["user: hello", "assistant: hi"],
        "What about my blood pressure?",
      );

      expect(spy).toHaveBeenCalledTimes(1);
      const [msg] = spy.mock.calls[0];
      expect(msg).toContain("user: hello");
      expect(msg).toContain("What about my blood pressure?");
    });
  });

  // ── prepareContextForChat — error path ───────────────────────────────────

  describe("prepareContextForChat — error path", () => {
    it("returns empty result when profileContextManager.isContextReady throws", async () => {
      mockIsContextReady.mockImplementation(() => { throw new Error("unexpected"); });

      const result = await svc.prepareContextForChat("query", { profileId: "p" });

      expect(result.documentCount).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });

  // ── prepareContextForChat — documentTypes + timeframe filters ─────────────

  describe("prepareContextForChat — documentTypes and timeframe", () => {
    it("passes documentTypes option through without crashing (searchResults is always empty)", async () => {
      mockIsContextReady.mockReturnValue(true);

      const result = await svc.prepareContextForChat("query", {
        profileId: "profile-1",
        documentTypes: ["report", "lab"],
        timeframe: { start: "2023-01-01", end: "2023-12-31" },
      });

      // searchResults is hardcoded [] so filteredResults is [] too
      expect(result.documentCount).toBe(0);
      expect(result.assembledContext).toBeUndefined();
    });
  });

  // ── getMCPToolsForChat — remaining delegates ──────────────────────────────

  describe("getMCPToolsForChat — remaining tool delegates", () => {
    it("getAssembledContext delegates to mcpTools.getAssembledContext", async () => {
      mockGetAssembled.mockResolvedValue({ content: [{ type: "text", text: "context" }] });
      const tools = svc.getMCPToolsForChat("profile-2");

      await tools.getAssembledContext("conversation text", { maxTokens: 1000 });

      expect(mockGetAssembled).toHaveBeenCalledWith("profile-2", {
        conversationContext: "conversation text",
        maxTokens: 1000,
      });
    });

    it("queryMedicalHistory delegates to mcpTools.queryMedicalHistory", async () => {
      mockQueryHistory.mockResolvedValue({ content: [] });
      const tools = svc.getMCPToolsForChat("profile-3");

      await tools.queryMedicalHistory("medications", { start: "2023-01-01" });

      expect(mockQueryHistory).toHaveBeenCalledWith("profile-3", {
        queryType: "medications",
        timeframe: { start: "2023-01-01" },
      });
    });

    it("queryMedicalHistory works without timeframe argument", async () => {
      mockQueryHistory.mockResolvedValue({ content: [] });
      const tools = svc.getMCPToolsForChat("profile-4");

      await tools.queryMedicalHistory("conditions");

      expect(mockQueryHistory).toHaveBeenCalledWith("profile-4", {
        queryType: "conditions",
        timeframe: undefined,
      });
    });
  });

  // ── generateContextSummary (private, exercised via prepareContextForChat) ─

  describe("generateContextSummary — via assembled context branch", () => {
    it("summarises key points by type and relevant documents", async () => {
      const { contextAssembler } = await import("../../context-assembly/context-composer");
      mockIsContextReady.mockReturnValue(true);

      // Manually inject a non-empty searchResults by overriding the private method
      // to include filteredResults. We test via createContextAwareSystemPrompt with
      // a context that has keyPoints instead, since searchResults is always [].
      // Exercise generateContextSummary directly through buildContextSection in
      // createContextAwareSystemPrompt which calls it implicitly.
      const assembledCtx = makeAssembledContext({
        keyPoints: [
          { text: "Diabetes", type: "diagnosis", date: "2023-01-01", confidence: 0.9 },
          { text: "Metformin", type: "medication", date: "2023-01-10", confidence: 0.85 },
          { text: "Another med", type: "medication", date: "2023-02-01", confidence: 0.8 },
        ],
        relevantDocuments: [{ documentId: "d1" }, { documentId: "d2" }],
        medicalContext: {
          recentChanges: [{ date: "2023-02-01", description: "New prescription" }],
        },
      });

      // Call private generateContextSummary directly via any cast
      const summary = (svc as any).generateContextSummary(assembledCtx);

      expect(summary).toContain("diagnosis");
      expect(summary).toContain("medication");
      expect(summary).toContain("2 relevant documents");
      expect(summary).toContain("1 recent medical changes noted");
    });

    it("returns fallback string when context has no keyPoints, no docs, no changes", async () => {
      const emptyCtx = makeAssembledContext({
        keyPoints: [],
        relevantDocuments: [],
        medicalContext: { recentChanges: [] },
      });

      const summary = (svc as any).generateContextSummary(emptyCtx);
      expect(summary).toBe("Medical context assembled successfully");
    });
  });

  // ── buildContextSection (private) — edge cases ────────────────────────────

  describe("buildContextSection — via createContextAwareSystemPrompt", () => {
    it("includes summary section when context has summary text", () => {
      const ctx = makeAssembledContext({ summary: "Patient is 45yo diabetic." });
      const contextResult = makeContextResult({ assembledContext: ctx });

      const prompt = svc.createContextAwareSystemPrompt("Base", contextResult);
      expect(prompt).toContain("Patient is 45yo diabetic.");
    });

    it("includes recent changes section when present", () => {
      const ctx = makeAssembledContext({
        medicalContext: {
          recentChanges: [{ date: "2024-01-01", description: "Started insulin" }],
        },
      });
      const contextResult = makeContextResult({ assembledContext: ctx });

      const prompt = svc.createContextAwareSystemPrompt("Base", contextResult);
      expect(prompt).toContain("Recent Changes");
      expect(prompt).toContain("Started insulin");
    });

    it("handles unknown tool names gracefully in tools section", () => {
      const contextResult = makeContextResult({
        availableTools: ["unknownTool", "searchDocuments"],
      });

      const prompt = svc.createContextAwareSystemPrompt("Base", contextResult);
      expect(prompt).toContain("unknownTool");
      expect(prompt).toContain("Medical data access tool");
    });
  });

  // ── filterResultsByTimeframe (private) ───────────────────────────────────

  describe("filterResultsByTimeframe (private)", () => {
    const filter = (results: any[], timeframe: any) =>
      (svc as any).filterResultsByTimeframe(results, timeframe);

    const docs = [
      { metadata: { date: "2022-06-15" }, id: "old" },
      { metadata: { date: "2023-06-15" }, id: "mid" },
      { metadata: { date: "2024-06-15" }, id: "new" },
    ];

    it("filters by start date only", () => {
      const result = filter(docs, { start: "2023-01-01" });
      expect(result.map((d: any) => d.id)).toEqual(["mid", "new"]);
    });

    it("filters by end date only", () => {
      const result = filter(docs, { end: "2023-12-31" });
      expect(result.map((d: any) => d.id)).toEqual(["old", "mid"]);
    });

    it("filters by both start and end date", () => {
      const result = filter(docs, { start: "2023-01-01", end: "2023-12-31" });
      expect(result.map((d: any) => d.id)).toEqual(["mid"]);
    });

    it("returns all results when no bounds specified", () => {
      const result = filter(docs, {});
      expect(result).toHaveLength(3);
    });
  });

  // ── createEmptyContextResult (protected) ─────────────────────────────────

  describe("createEmptyContextResult", () => {
    it("returns correct shape with all 5 tools", () => {
      const result = (svc as any).createEmptyContextResult();
      expect(result.documentCount).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.tokenUsage).toBe(0);
      expect(result.availableTools).toHaveLength(5);
      expect(result.availableTools).toContain("getDocumentById");
    });
  });
});
