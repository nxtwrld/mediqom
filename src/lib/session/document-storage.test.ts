import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/logging/logger", () => ({
  logger: {
    session: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

const { mockAddDocument } = vi.hoisted(() => ({
  mockAddDocument: vi.fn(),
}));
vi.mock("$lib/documents", () => ({
  addDocument: mockAddDocument,
}));

import { isSessionDocument, loadSessionFromDocument, saveSessionAsDocument } from "./document-storage";

function makeAnalysis(overrides: Record<string, any> = {}): any {
  return {
    sessionId: "session-1",
    timestamp: new Date().toISOString(),
    analysisVersion: 1,
    nodes: { symptoms: [], diagnoses: [], treatments: [], actions: [] },
    userActions: [],
    ...overrides,
  };
}

function makeDocument(overrides: Record<string, any> = {}): any {
  return {
    id: "doc-1",
    content: {
      sessionAnalysis: {
        analysis: makeAnalysis(),
        transcript: [],
      },
    },
    ...overrides,
  };
}

describe("session/document-storage", () => {
  beforeEach(() => {
    mockAddDocument.mockReset();
  });

  // ── isSessionDocument ─────────────────────────────────────────────────────

  describe("isSessionDocument", () => {
    it("returns true when document contains sessionAnalysis.analysis", () => {
      expect(isSessionDocument(makeDocument())).toBe(true);
    });

    it("returns false when content is absent", () => {
      expect(isSessionDocument({ id: "doc-1" })).toBe(false);
    });

    it("returns false when sessionAnalysis is absent", () => {
      expect(isSessionDocument({ content: { title: "Report" } })).toBe(false);
    });

    it("returns false when sessionAnalysis.analysis is absent", () => {
      expect(isSessionDocument({ content: { sessionAnalysis: {} } })).toBe(false);
    });

    it("returns false for null", () => {
      expect(isSessionDocument(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isSessionDocument(undefined)).toBe(false);
    });
  });

  // ── loadSessionFromDocument ───────────────────────────────────────────────

  describe("loadSessionFromDocument", () => {
    it("returns the analysis object from document content", () => {
      const analysis = makeAnalysis();
      const doc = makeDocument({ content: { sessionAnalysis: { analysis, transcript: [] } } });

      const result = loadSessionFromDocument(doc);
      expect(result).toBe(analysis);
    });

    it("returns null when document has no sessionAnalysis", () => {
      expect(loadSessionFromDocument({ content: { title: "other" } })).toBeNull();
    });

    it("returns null when analysis is absent from sessionAnalysis", () => {
      expect(
        loadSessionFromDocument({ content: { sessionAnalysis: { transcript: [] } } }),
      ).toBeNull();
    });

    it("returns null for null document", () => {
      expect(loadSessionFromDocument(null)).toBeNull();
    });
  });

  // ── saveSessionAsDocument ─────────────────────────────────────────────────

  describe("saveSessionAsDocument", () => {
    it("calls addDocument and returns the saved document id", async () => {
      mockAddDocument.mockResolvedValue({ id: "saved-doc-id" });

      const id = await saveSessionAsDocument(
        makeAnalysis(),
        [],
        "patient-1",
        "performer-1",
        "Dr Smith",
      );

      expect(id).toBe("saved-doc-id");
      expect(mockAddDocument).toHaveBeenCalledTimes(1);
    });

    it("passes patientId as user_id on the document", async () => {
      mockAddDocument.mockResolvedValue({ id: "doc-1" });

      await saveSessionAsDocument(makeAnalysis(), [], "patient-99", "perf-1", "Dr Jones");

      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.user_id).toBe("patient-99");
    });

    it("embeds the analysis object inside sessionAnalysis.analysis", async () => {
      mockAddDocument.mockResolvedValue({ id: "doc-1" });
      const analysis = makeAnalysis({ sessionId: "my-session" });

      await saveSessionAsDocument(analysis, ["t1", "t2"], "pat-1", "perf-1", "Dr A");

      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.content.sessionAnalysis.analysis).toBe(analysis);
      expect(docArg.content.sessionAnalysis.transcript).toEqual(["t1", "t2"]);
    });

    it("includes metadata with performerId and patientId", async () => {
      mockAddDocument.mockResolvedValue({ id: "doc-1" });

      await saveSessionAsDocument(makeAnalysis(), [], "pat-1", "perf-xyz", "Dr B");

      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.metadata.performerId).toBe("perf-xyz");
      expect(docArg.metadata.patientId).toBe("pat-1");
    });

    it("rethrows when addDocument rejects", async () => {
      mockAddDocument.mockRejectedValue(new Error("DB error"));

      await expect(
        saveSessionAsDocument(makeAnalysis(), [], "pat-1", "perf-1", "Dr C"),
      ).rejects.toThrow("DB error");
    });
  });
});
