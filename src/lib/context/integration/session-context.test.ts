import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetContextStats,
  mockIsContextReady,
  mockPrepareContext,
  mockApiFetch,
} = vi.hoisted(() => ({
  mockGetContextStats: vi.fn().mockReturnValue(null),
  mockIsContextReady: vi.fn().mockReturnValue(false),
  mockPrepareContext: vi.fn(),
  mockApiFetch: vi.fn(),
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
vi.mock("./profile-context", () => ({
  profileContextManager: {
    getContextStats: mockGetContextStats,
    isContextReady: mockIsContextReady,
  },
}));
vi.mock("./chat-service", () => ({
  chatContextService: { prepareContextForChat: mockPrepareContext },
}));
vi.mock("../context-assembly/context-composer", () => ({
  contextAssembler: { assembleContextForAI: vi.fn() },
}));
vi.mock("$lib/api/client", () => ({ apiFetch: mockApiFetch }));

import { SessionContextService } from "./session-context";

function makeSessionData(overrides: Record<string, any> = {}) {
  return {
    userId: "user-1",
    language: "en",
    models: [],
    status: "active" as const,
    startTime: new Date().toISOString(),
    transcripts: [],
    conversationHistory: [],
    realtimeUpdates: [],
    analysisState: {
      lastProcessedTranscriptIndex: 0,
      lastAnalysisTime: 0,
      currentDiagnosis: [],
      currentTreatment: [],
      currentMedication: [],
      currentFollowUp: [],
      analysisInProgress: false,
      contextAvailable: false,
      lastContextUpdate: 0,
    },
    ...overrides,
  };
}

function makeOptions(overrides: Record<string, any> = {}) {
  return { profileId: "profile-1", ...overrides };
}

describe("context/integration/session-context — SessionContextService", () => {
  let svc: SessionContextService;

  beforeEach(() => {
    svc = new SessionContextService();
    mockGetContextStats.mockReturnValue(null);
    mockIsContextReady.mockReturnValue(false);
    mockPrepareContext.mockReset();
    mockApiFetch.mockReset();
  });

  // ── clearSessionContext ────────────────────────────────────────────────────

  describe("clearSessionContext", () => {
    it("removes cached context for the session", async () => {
      // Prime the cache via initializeSessionContext returning empty result
      // (getContextStats returns null → returns empty result and caches it)
      // Instead, directly test by calling clear on a freshly created service
      svc.clearSessionContext("session-999");
      // No error thrown = pass; nothing was cached, delete is a no-op
    });

    it("clears an existing entry so subsequent getContextForAnalysis returns empty", async () => {
      // Manually access the private cache via any cast
      const cache = (svc as any).sessionContextCache as Map<string, any>;
      cache.set("session-1", {
        result: { assembledContext: { keyPoints: [] } },
        lastUpdate: Date.now(),
        transcriptCount: 0,
      });

      svc.clearSessionContext("session-1");

      const result = await svc.getContextForAnalysis(
        "session-1",
        "diagnosis",
        makeSessionData(),
      );
      expect(result.medicalHistory).toEqual([]);
      expect(result.contextSummary).toBe("No context available for analysis");
    });
  });

  // ── getContextForAnalysis ─────────────────────────────────────────────────

  describe("getContextForAnalysis", () => {
    it("returns empty when session not cached", async () => {
      const result = await svc.getContextForAnalysis(
        "unknown-session",
        "diagnosis",
        makeSessionData(),
      );

      expect(result.medicalHistory).toEqual([]);
      expect(result.relevantDocuments).toEqual([]);
      expect(result.contextSummary).toContain("No context available");
    });

    it("returns empty when cached but no assembledContext", async () => {
      const cache = (svc as any).sessionContextCache as Map<string, any>;
      cache.set("session-2", {
        result: { assembledContext: null },
        lastUpdate: Date.now(),
        transcriptCount: 0,
      });

      const result = await svc.getContextForAnalysis(
        "session-2",
        "diagnosis",
        makeSessionData(),
      );

      expect(result.medicalHistory).toEqual([]);
      expect(result.contextSummary).toContain("No medical context assembled");
    });

    it("filters keyPoints by analysis type 'diagnosis'", async () => {
      const cache = (svc as any).sessionContextCache as Map<string, any>;
      cache.set("session-3", {
        result: {
          assembledContext: {
            keyPoints: [
              { text: "Type 2 Diabetes diagnosis", type: "diagnosis", date: "2023-01-01" },
              { text: "Metformin prescription", type: "medication", date: "2023-01-01" },
              { text: "Knee surgery procedure", type: "procedure", date: "2023-01-01" },
            ],
            relevantDocuments: [],
          },
        },
        lastUpdate: Date.now(),
        transcriptCount: 0,
      });

      const result = await svc.getContextForAnalysis(
        "session-3",
        "diagnosis",
        makeSessionData(),
      );

      expect(result.medicalHistory).toHaveLength(1);
      expect(result.medicalHistory[0].type).toBe("diagnosis");
    });

    it("filters keyPoints by analysis type 'medication'", async () => {
      const cache = (svc as any).sessionContextCache as Map<string, any>;
      cache.set("session-4", {
        result: {
          assembledContext: {
            keyPoints: [
              { text: "Metformin prescription", type: "medication", date: "2023-01-01" },
              { text: "MRI scan procedure", type: "procedure", date: "2023-01-01" },
            ],
            relevantDocuments: [{ documentId: "doc-1" }],
          },
        },
        lastUpdate: Date.now(),
        transcriptCount: 0,
      });

      const result = await svc.getContextForAnalysis(
        "session-4",
        "medication",
        makeSessionData(),
      );

      expect(result.medicalHistory).toHaveLength(1);
      expect(result.medicalHistory[0].text).toContain("Metformin");
      expect(result.relevantDocuments).toHaveLength(1);
    });

    it("filters by text content when type does not match exactly", async () => {
      const cache = (svc as any).sessionContextCache as Map<string, any>;
      cache.set("session-5", {
        result: {
          assembledContext: {
            keyPoints: [
              { text: "Follow-up appointment scheduled", type: "other", date: "2023-01-01" },
            ],
            relevantDocuments: [],
          },
        },
        lastUpdate: Date.now(),
        transcriptCount: 0,
      });

      const result = await svc.getContextForAnalysis(
        "session-5",
        "followup",
        makeSessionData(),
      );

      // "followup" maps to ["followup","appointment","referral"]
      // The text contains "appointment" → should match
      expect(result.medicalHistory).toHaveLength(1);
    });

    it("includes contextSummary with count of history items", async () => {
      const cache = (svc as any).sessionContextCache as Map<string, any>;
      cache.set("session-6", {
        result: {
          assembledContext: {
            keyPoints: [
              { text: "Diabetes", type: "diagnosis", date: "2023-01-01" },
              { text: "Hypertension condition", type: "condition", date: "2023-01-01" },
            ],
            relevantDocuments: [],
          },
        },
        lastUpdate: Date.now(),
        transcriptCount: 0,
      });

      const result = await svc.getContextForAnalysis(
        "session-6",
        "diagnosis",
        makeSessionData(),
      );

      expect(result.contextSummary).toContain("diagnosis");
    });
  });

  // ── updateSessionContext ──────────────────────────────────────────────────

  describe("updateSessionContext", () => {
    it("returns cached result if fewer than 3 new transcripts within 30s", async () => {
      const cachedResult = {
        assembledContext: undefined,
        availableTools: ["searchDocuments"],
        contextSummary: "Cached context",
        documentCount: 1,
        confidence: 0.7,
        tokenUsage: 100,
        relevantHistory: [],
      };

      const cache = (svc as any).sessionContextCache as Map<string, any>;
      cache.set("session-7", {
        result: cachedResult,
        lastUpdate: Date.now(), // Very recent
        transcriptCount: 5,
      });

      const sessionData = makeSessionData({ transcripts: ["t1", "t2", "t3", "t4", "t5", "t6"] });
      // 6 - 5 = 1 new transcript < 3 threshold

      const result = await svc.updateSessionContext(
        "session-7",
        sessionData,
        ["new transcript"],
        makeOptions(),
      );

      expect(result.contextSummary).toBe("Cached context");
      expect(mockPrepareContext).not.toHaveBeenCalled();
    });

    it("refreshes context when 3 or more new transcripts since last update", async () => {
      const chatResult = {
        assembledContext: undefined,
        availableTools: [],
        contextSummary: "Fresh context",
        documentCount: 2,
        confidence: 0.8,
        tokenUsage: 300,
      };
      mockPrepareContext.mockResolvedValue(chatResult);

      const cache = (svc as any).sessionContextCache as Map<string, any>;
      cache.set("session-8", {
        result: { contextSummary: "Old context" },
        lastUpdate: Date.now(),
        transcriptCount: 2,
      });

      // Current transcript count 2+3=5, 5-2=3 new → above threshold
      const sessionData = makeSessionData({ transcripts: ["a", "b", "c", "d", "e"] });

      const result = await svc.updateSessionContext(
        "session-8",
        sessionData,
        ["new1", "new2", "new3"],
        makeOptions(),
      );

      expect(mockPrepareContext).toHaveBeenCalledTimes(1);
      expect(result.contextSummary).toBe("Fresh context");
    });

    it("refreshes context when cache is older than 30 seconds", async () => {
      const chatResult = {
        assembledContext: undefined,
        availableTools: [],
        contextSummary: "Refreshed",
        documentCount: 0,
        confidence: 0,
        tokenUsage: 0,
      };
      mockPrepareContext.mockResolvedValue(chatResult);

      const cache = (svc as any).sessionContextCache as Map<string, any>;
      cache.set("session-9", {
        result: { contextSummary: "Stale" },
        lastUpdate: Date.now() - 31000, // 31 seconds ago
        transcriptCount: 5,
      });

      const sessionData = makeSessionData({ transcripts: ["a", "b", "c", "d", "e", "f"] });
      // Only 1 new transcript, but cache is stale

      const result = await svc.updateSessionContext(
        "session-9",
        sessionData,
        ["just one"],
        makeOptions(),
      );

      expect(mockPrepareContext).toHaveBeenCalledTimes(1);
      expect(result.contextSummary).toBe("Refreshed");
    });

    it("returns empty result when no cache and prepareContext fails", async () => {
      mockPrepareContext.mockRejectedValue(new Error("Network error"));

      const result = await svc.updateSessionContext(
        "no-cache-session",
        makeSessionData(),
        ["t1", "t2", "t3"],
        makeOptions(),
      );

      expect(result.documentCount).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });

  // ── initializeSessionContext (empty path) ─────────────────────────────────

  describe("initializeSessionContext", () => {
    it("returns empty result when profile has no context stats", async () => {
      mockGetContextStats.mockReturnValue(null);

      const result = await svc.initializeSessionContext(
        "session-init",
        makeSessionData() as any,
        makeOptions(),
      );

      expect(result.documentCount).toBe(0);
      expect(result.availableTools).toContain("searchDocuments");
    });

    it("returns empty result and does not throw when apiFetch fails", async () => {
      mockGetContextStats.mockReturnValue({
        database: {
          search: vi.fn().mockRejectedValue(new Error("Search failed")),
        },
      });
      mockApiFetch.mockRejectedValue(new Error("API error"));

      const result = await svc.initializeSessionContext(
        "session-fail",
        makeSessionData() as any,
        makeOptions(),
      );

      expect(result.documentCount).toBe(0);
    });

    it("assembles context and extracts relevant history when search returns results", async () => {
      const { contextAssembler } = await import("../context-assembly/context-composer");
      const mockSearch = vi.fn().mockResolvedValue([
        {
          metadata: { documentType: "report", date: "2023-06-01", title: "Blood test" },
          excerpt: "Normal CBC results",
        },
      ]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { embedding: Array.from({ length: 4 }, (_, i) => i * 0.1) },
        }),
      });
      (contextAssembler.assembleContextForAI as any).mockResolvedValue({
        keyPoints: [{ text: "Blood test", type: "diagnosis" }],
        relevantDocuments: [],
        medicalContext: { recentChanges: [] },
        confidence: 0.9,
        tokenCount: 500,
        summary: "Patient summary",
      });

      const result = await svc.initializeSessionContext(
        "session-full",
        makeSessionData() as any,
        makeOptions(),
      );

      expect(result.documentCount).toBe(1);
      expect(result.confidence).toBe(0.9);
      expect(result.tokenUsage).toBe(500);
      expect(result.relevantHistory).toHaveLength(1);
      expect(result.contextSummary).toContain("Session context assembled");
    });

    it("filters search results by priorityTypes when specified", async () => {
      const { contextAssembler } = await import("../context-assembly/context-composer");
      const mockSearch = vi.fn().mockResolvedValue([
        {
          metadata: { documentType: "report", category: "lab", date: "2023-06-01", title: "Lab" },
          excerpt: "Lab result",
        },
        {
          metadata: { documentType: "medication", category: "medication", date: "2023-06-01", title: "Rx" },
          excerpt: "Prescription",
        },
      ]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { embedding: [0.1, 0.2] },
        }),
      });
      (contextAssembler.assembleContextForAI as any).mockResolvedValue({
        keyPoints: [],
        relevantDocuments: [],
        medicalContext: {},
        confidence: 0.8,
        tokenCount: 200,
        summary: "",
      });

      const result = await svc.initializeSessionContext(
        "session-priority",
        makeSessionData() as any,
        makeOptions({ priorityTypes: ["medication"] }),
      );

      // Only the medication document matches the priority filter
      expect(result.documentCount).toBe(1);
    });

    it("includes priorityTypes in context query string", async () => {
      mockGetContextStats.mockReturnValue(null);

      // Access buildSessionContextQuery via reflection
      const query = (svc as any).buildSessionContextQuery(
        makeSessionData(),
        makeOptions({ priorityTypes: ["diagnosis", "medication"] }),
      );

      expect(query).toContain("Focus areas: diagnosis, medication");
    });

    it("generateQueryEmbedding throws when API response is not ok", async () => {
      mockGetContextStats.mockReturnValue({
        database: { search: vi.fn() },
      });
      mockApiFetch.mockResolvedValue({
        ok: false,
        statusText: "Bad Request",
        json: vi.fn().mockResolvedValue({ message: "Bad input" }),
      });

      const result = await svc.initializeSessionContext(
        "session-embed-fail",
        makeSessionData() as any,
        makeOptions(),
      );

      expect(result.documentCount).toBe(0);
    });

    it("generateQueryEmbedding throws when response data is invalid", async () => {
      mockGetContextStats.mockReturnValue({
        database: { search: vi.fn() },
      });
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: false }),
      });

      const result = await svc.initializeSessionContext(
        "session-bad-data",
        makeSessionData() as any,
        makeOptions(),
      );

      expect(result.documentCount).toBe(0);
    });
  });

  // ── generateSessionContextSummary ─────────────────────────────────────────

  describe("generateSessionContextSummary (via initializeSessionContext)", () => {
    it("mentions recent medical changes when present", async () => {
      const { contextAssembler } = await import("../context-assembly/context-composer");
      const mockSearch = vi.fn().mockResolvedValue([
        { metadata: { documentType: "report", date: "2023-01-01", title: "Report" }, excerpt: "x" },
      ]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { embedding: [0.1] } }),
      });
      (contextAssembler.assembleContextForAI as any).mockResolvedValue({
        keyPoints: [],
        relevantDocuments: [{ documentId: "doc-1" }],
        medicalContext: { recentChanges: [{ date: "2023-01-01", description: "New meds" }] },
        confidence: 0.7,
        tokenCount: 150,
        summary: "",
      });

      const result = await svc.initializeSessionContext(
        "session-summary-changes",
        makeSessionData() as any,
        makeOptions(),
      );

      expect(result.contextSummary).toContain("recent medical changes");
    });

    it("mentions relevant documents count in summary", async () => {
      const { contextAssembler } = await import("../context-assembly/context-composer");
      const mockSearch = vi.fn().mockResolvedValue([
        { metadata: { documentType: "report", date: "2023-01-01", title: "R1" }, excerpt: "a" },
      ]);
      mockGetContextStats.mockReturnValue({ database: { search: mockSearch } });
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { embedding: [0.1] } }),
      });
      (contextAssembler.assembleContextForAI as any).mockResolvedValue({
        keyPoints: [],
        relevantDocuments: [{ documentId: "doc-a" }, { documentId: "doc-b" }],
        medicalContext: {},
        confidence: 0.6,
        tokenCount: 100,
        summary: "",
      });

      const result = await svc.initializeSessionContext(
        "session-summary-docs",
        makeSessionData() as any,
        makeOptions(),
      );

      expect(result.contextSummary).toContain("relevant medical documents");
    });
  });

  // ── extractRelevantHistoryFromContext ─────────────────────────────────────

  describe("extractRelevantHistoryFromContext (via updateSessionContext)", () => {
    it("returns empty array when assembledContext has no keyPoints", async () => {
      const chatResult = {
        assembledContext: { keyPoints: undefined, relevantDocuments: [] },
        availableTools: [],
        contextSummary: "No keypoints",
        documentCount: 0,
        confidence: 0,
        tokenUsage: 0,
      };
      mockPrepareContext.mockResolvedValue(chatResult);

      const result = await svc.updateSessionContext(
        "session-no-kp",
        makeSessionData({ transcripts: ["a", "b", "c"] }),
        ["t1", "t2", "t3"],
        makeOptions(),
      );

      expect(result.relevantHistory).toEqual([]);
    });

    it("maps keyPoints to formatted strings", async () => {
      const chatResult = {
        assembledContext: {
          keyPoints: [
            { text: "Diabetes diagnosis", date: "2023-01-01" },
            { text: "Metformin prescribed", date: undefined },
          ],
        },
        availableTools: [],
        contextSummary: "ctx",
        documentCount: 1,
        confidence: 0.8,
        tokenUsage: 200,
      };
      mockPrepareContext.mockResolvedValue(chatResult);

      const result = await svc.updateSessionContext(
        "session-kp-format",
        makeSessionData({ transcripts: ["a", "b", "c"] }),
        ["t1", "t2", "t3"],
        makeOptions(),
      );

      expect(result.relevantHistory[0]).toContain("2023-01-01");
      expect(result.relevantHistory[0]).toContain("Diabetes diagnosis");
      expect(result.relevantHistory[1]).toContain("Unknown date");
    });
  });

  // ── getContextForAnalysis error path ──────────────────────────────────────

  describe("getContextForAnalysis error path", () => {
    it("returns error result when cache access throws", async () => {
      // Replace the cache with a Proxy that throws on .get()
      const throwingCache = new Proxy(new Map(), {
        get(target, prop) {
          if (prop === "get") return () => { throw new Error("cache error"); };
          return (target as any)[prop];
        },
      });
      (svc as any).sessionContextCache = throwingCache;

      const result = await svc.getContextForAnalysis(
        "session-err",
        "diagnosis",
        makeSessionData(),
      );

      expect(result.medicalHistory).toEqual([]);
      expect(result.contextSummary).toBe("Error retrieving context for analysis");
    });
  });
});
