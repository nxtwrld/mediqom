import { describe, it, expect, vi, beforeEach } from "vitest";
import { readable } from "svelte/store";

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

const { mockExecuteTool, mockByUser } = vi.hoisted(() => ({
  mockExecuteTool: vi.fn().mockResolvedValue({ success: false, data: null }),
  mockByUser: vi.fn(),
}));

vi.mock("./client-tool-executor", () => ({
  ClientToolExecutor: class {
    constructor(public opts: any) {}
    executeTool = mockExecuteTool;
  },
}));

vi.mock("$lib/documents", () => ({
  byUser: mockByUser,
}));

vi.mock("$lib/utils/id", () => ({
  generateId: () => `test-id-${Math.random().toString(36).slice(2)}`,
}));

// Mock any complex dependencies of client-tool-executor transitively
vi.mock("$lib/profiles", () => ({
  profiles: { get: vi.fn().mockReturnValue([]), subscribe: vi.fn() },
}));
vi.mock("$lib/user", () => ({
  default: { get: vi.fn().mockReturnValue(null), subscribe: vi.fn() },
}));

import { TestCommandHandler } from "./test-commands";

function makeHandler(chatContext?: any) {
  return new TestCommandHandler("profile-1", chatContext);
}

function makeExecutorResult(data: any) {
  return { success: true, data };
}

function makeMCPResult(obj: any) {
  return {
    success: true,
    data: {
      content: [{ type: "text", text: JSON.stringify(obj) }],
    },
  };
}

describe("chat/test-commands — TestCommandHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteTool.mockResolvedValue({ success: false, data: null });
    mockByUser.mockReturnValue(readable([]));
  });

  // ── execute routing ──────────────────────────────────────────────────────

  describe("execute", () => {
    it("returns error for unknown command", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:bogus");
      expect(result.content).toContain("Unknown test command");
      expect(result.content).toContain("bogus");
    });

    it("handles test: prefix stripping", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:list");
      expect(result.content).toContain("Available test commands");
    });

    it("handles command with args", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:search diabetes");
      expect(result).toBeDefined();
    });
  });

  // ── handleList ───────────────────────────────────────────────────────────

  describe("handleList", () => {
    it("returns list of available commands", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:list");
      expect(result.content).toContain("test:health");
      expect(result.content).toContain("test:signal");
      expect(result.content).toContain("test:all");
    });
  });

  // ── handleAnatomy (static response) ─────────────────────────────────────

  describe("handleAnatomy", () => {
    it("returns anatomy widget without calling executor", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:anatomy");
      expect(result.content).toContain("Anatomy");
      expect(result.widgets).toHaveLength(1);
      expect(result.widgets![0].type).toBe("anatomy_highlight");
    });
  });

  // ── handleHealth ─────────────────────────────────────────────────────────

  describe("handleHealth", () => {
    it("returns sample data when executor returns no data", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:health");
      expect(result.content).toContain("Profile Data");
      expect(result.toolsUsed).toContain("getProfileData");
    });

    it("returns data table when executor returns profile data", async () => {
      mockExecuteTool.mockResolvedValueOnce(makeMCPResult({
        name: "John Smith",
        bloodType: "A+",
        age: 45,
      }));
      const handler = makeHandler();
      const result = await handler.execute("test:health");
      expect(result.widgets!.some((w) => w.type === "data_table")).toBe(true);
    });

    it("falls back to text dump when rows cannot be extracted", async () => {
      mockExecuteTool.mockResolvedValueOnce(makeMCPResult("raw text response"));
      const handler = makeHandler();
      const result = await handler.execute("test:health");
      expect(result.content).toContain("Profile Data");
    });
  });

  // ── handleSearch / handleDocument ────────────────────────────────────────

  describe("handleSearch / handleDocument", () => {
    it("returns sample table when no documents found", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:document");
      expect(result.content).toContain("Document Search");
      expect(result.widgets!.some((w) => w.type === "data_table")).toBe(true);
    });

    it("returns real results when documents are found", async () => {
      mockExecuteTool.mockResolvedValueOnce(
        makeMCPResult([
          { title: "Blood Test", type: "lab", date: "2024-01-01" },
          { title: "X-Ray", type: "radiology", date: "2024-02-01" },
        ]),
      );
      const handler = makeHandler();
      const result = await handler.execute("test:search blood");
      expect(result.content).toContain("2 result(s)");
    });

    it("uses provided search term", async () => {
      const handler = makeHandler();
      await handler.execute("test:search diabetes");
      expect(mockExecuteTool).toHaveBeenCalledWith(
        "searchDocuments",
        expect.objectContaining({ terms: ["diabetes"] }),
      );
    });
  });

  // ── handleSignal ─────────────────────────────────────────────────────────

  describe("handleSignal", () => {
    it("returns sample lab trend when not enough real data", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:signal");
      expect(result.widgets!.some((w) => w.type === "lab_trend_chart")).toBe(true);
    });

    it("returns real trend when documents have multiple signals", async () => {
      mockExecuteTool.mockResolvedValueOnce(
        makeMCPResult([
          {
            signals: [
              { signal: "HbA1c", value: 6.1, unit: "%", date: "2024-01-01" },
              { signal: "HbA1c", value: 5.8, unit: "%", date: "2024-06-01" },
            ],
          },
        ]),
      );
      const handler = makeHandler();
      const result = await handler.execute("test:signal");
      expect(result.widgets!.some((w) => w.type === "lab_trend_chart")).toBe(true);
      expect(result.widgets![0].data.series).toHaveLength(2);
    });
  });

  // ── handleDiagnosis ───────────────────────────────────────────────────────

  describe("handleDiagnosis", () => {
    it("returns sample diagnosis when no data available", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:diagnosis");
      expect(result.widgets!.some((w) => w.type === "diagnosis_card")).toBe(true);
      expect(result.content).toContain("sample data");
    });

    it("returns real diagnosis when data is available", async () => {
      mockExecuteTool.mockResolvedValueOnce(
        makeMCPResult([
          { name: "Hypertension", probability: 0.9, icd10: "I10" },
        ]),
      );
      const handler = makeHandler();
      const result = await handler.execute("test:diagnosis");
      expect(result.widgets!.some((w) => w.type === "diagnosis_card")).toBe(true);
      expect(result.content).not.toContain("sample data");
    });
  });

  // ── handleSymptoms ────────────────────────────────────────────────────────

  describe("handleSymptoms", () => {
    it("returns sample symptom widget when no data", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:symptoms");
      expect(result.widgets!.some((w) => w.type === "symptom_summary")).toBe(true);
      expect(result.content).toContain("sample data");
    });

    it("returns real symptom when data available", async () => {
      mockExecuteTool.mockResolvedValueOnce(
        makeMCPResult([
          { text: "Chest pain", severity: 8, confidence: 0.9 },
        ]),
      );
      const handler = makeHandler();
      const result = await handler.execute("test:symptoms");
      expect(result.widgets![0].title).toBe("Chest pain");
    });
  });

  // ── handleTreatment ───────────────────────────────────────────────────────

  describe("handleTreatment", () => {
    it("returns sample treatment when no data", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:treatment");
      expect(result.widgets!.some((w) => w.type === "treatment_plan")).toBe(true);
      expect(result.content).toContain("sample data");
    });

    it("returns real treatment when medication data available", async () => {
      mockExecuteTool.mockResolvedValueOnce(
        makeMCPResult({ medications: [{ name: "Lisinopril", dosage: "10mg" }] }),
      );
      const handler = makeHandler();
      const result = await handler.execute("test:treatment");
      expect(result.widgets![0].title).toBe("Lisinopril");
    });
  });

  // ── handleProgress ────────────────────────────────────────────────────────

  describe("handleProgress", () => {
    it("returns progress indicator widget with default value", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:progress");
      expect(result.widgets!.some((w) => w.type === "progress_indicator")).toBe(true);
    });

    it("computes progress from profile data fields", async () => {
      mockExecuteTool.mockResolvedValueOnce(
        makeMCPResult({ name: "John", age: 45, height: "175cm", weight: null }),
      );
      const handler = makeHandler();
      const result = await handler.execute("test:progress");
      const progress = result.widgets![0];
      expect(progress.data.value).toBeGreaterThan(0);
      expect(progress.data.value).toBeLessThanOrEqual(100);
    });
  });

  // ── handleContext ─────────────────────────────────────────────────────────

  describe("handleContext", () => {
    it("returns context output with no page context", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:context");
      expect(result.content).toContain("AI Context Debug");
      expect(result.content).toContain("Page context not available");
    });

    it("returns context with full page context including catalog and signals", async () => {
      const chatContext = {
        mode: "clinical",
        language: "en",
        profileId: "profile-1",
        isOwnProfile: true,
        conversationThreadId: "thread-1",
        availableTools: ["searchDocuments", "getProfileData"],
        pageContext: {
          route: "/appointments",
          profileName: "John Smith",
          availableData: {
            conditions: ["Hypertension"],
            medications: ["Lisinopril"],
            vitals: ["BP: 130/85"],
            documents: ["doc-1", "doc-2"],
          },
          documentCatalog: [
            {
              id: "doc-1",
              title: "Blood Test",
              category: "lab",
              date: "2024-01-01",
              medicalTerms: ["glucose", "HbA1c"],
            },
          ],
          documentsContent: new Map([
            ["doc-1", {
              title: "Blood Test",
              signals: [
                { signal: "Glucose", value: 5.4, unit: "mmol/L" },
                { signal: "HbA1c", value: 5.8, unit: "%" },
                { signal: "Cholesterol", value: 4.2, unit: "mmol/L" },
                { signal: "LDL", value: 2.1, unit: "mmol/L" },
              ],
              content: "Lab result text",
              tags: ["annual", "lab"],
            }],
            ["doc-2", { title: "X-Ray", content: "findings" }],
          ]),
        },
      };
      const handler = makeHandler(chatContext);
      const result = await handler.execute("test:context");
      expect(result.content).toContain("AI Context Debug");
      expect(result.content).toContain("Hypertension");
      expect(result.content).toContain("Documents");
    });

    it("handles documentsContent as Map", async () => {
      const map = new Map([
        ["doc-1", { title: "Lab Test", signals: [{ signal: "Glucose", value: 5.4 }] }],
      ]);
      const chatContext = {
        mode: "patient",
        language: "en",
        pageContext: {
          route: "/",
          availableData: {},
          documentsContent: map,
        },
      };
      const handler = makeHandler(chatContext);
      const result = await handler.execute("test:context");
      expect(result.content).toContain("Document Signals");
    });
  });

  // ── handleTimeline ────────────────────────────────────────────────────────

  describe("handleTimeline", () => {
    it("returns sample timeline when no data", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:timeline");
      expect(result.content).toContain("sample data");
      expect(result.widgets!.some((w) => w.type === "data_table")).toBe(true);
    });

    it("returns real timeline when data available", async () => {
      mockExecuteTool.mockResolvedValueOnce(
        makeMCPResult([
          { date: "2024-01-01", name: "Annual checkup", type: "Visit" },
          { date: "2024-06-01", name: "Blood panel", type: "Lab" },
        ]),
      );
      const handler = makeHandler();
      const result = await handler.execute("test:timeline");
      expect(result.content).toContain("2 event(s)");
    });
  });

  // ── handleApprove ─────────────────────────────────────────────────────────

  describe("handleApprove", () => {
    it("returns no-documents message when search finds nothing", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:approve");
      expect(result.content).toContain("No documents found");
    });

    it("returns pendingToolCall when documents found via resource item", async () => {
      mockExecuteTool.mockResolvedValueOnce({
        success: true,
        data: {
          content: [
            {
              type: "resource",
              resource: {
                documents: [{ id: "doc-123", title: "Blood Test", type: "lab" }],
              },
            },
          ],
        },
      });
      const handler = makeHandler();
      const result = await handler.execute("test:approve health");
      expect(result.pendingToolCall?.toolName).toBe("getDocumentById");
      expect(result.pendingToolCall?.parameters.documentId).toBe("doc-123");
    });

    it("returns pendingToolCall when documents found via text JSON", async () => {
      mockExecuteTool.mockResolvedValueOnce({
        success: true,
        data: {
          content: [
            {
              type: "text",
              text: JSON.stringify([
                { id: "doc-456", title: "X-Ray", type: "radiology" },
              ]),
            },
          ],
        },
      });
      const handler = makeHandler();
      const result = await handler.execute("test:approve xray");
      expect(result.pendingToolCall?.parameters.documentId).toBe("doc-456");
    });
  });

  // ── handleDocs ────────────────────────────────────────────────────────────

  describe("handleDocs", () => {
    it("returns empty message when no documents in store", async () => {
      mockByUser.mockReturnValue(readable([]));
      const handler = makeHandler();
      const result = await handler.execute("test:docs");
      expect(result.content).toContain("No documents found");
    });

    it("returns data table when documents exist", async () => {
      mockByUser.mockReturnValue(
        readable([
          {
            id: "doc-1",
            content: { title: "Annual Checkup" },
            metadata: {},
            medicalTerms: ["hypertension", "diabetes"],
            created_at: "2024-01-01T00:00:00Z",
          },
        ]),
      );
      const handler = makeHandler();
      const result = await handler.execute("test:docs");
      expect(result.content).toContain("1 document(s)");
      expect(result.widgets!.some((w) => w.type === "data_table")).toBe(true);
    });
  });

  // ── handleAll ─────────────────────────────────────────────────────────────

  describe("handleAll", () => {
    it("returns all 7 widget types in gallery", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:all");
      expect(result.content).toContain("Widget Gallery");
      const types = result.widgets!.map((w) => w.type);
      expect(types).toContain("data_table");
      expect(types).toContain("lab_trend_chart");
      expect(types).toContain("diagnosis_card");
      expect(types).toContain("symptom_summary");
      expect(types).toContain("treatment_plan");
      expect(types).toContain("anatomy_highlight");
      expect(types).toContain("progress_indicator");
    });
  });

  // ── handleAgent ───────────────────────────────────────────────────────────

  describe("handleAgent", () => {
    it("redirects to AI pipeline for known agent type", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:agent lab_results");
      expect(result.redirectMessage).toBeDefined();
      expect(result.content).toContain("lab_results");
    });

    it("uses default lab_results when no args provided", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:agent");
      expect(result.redirectMessage).toBeDefined();
    });

    it("returns error for unknown agent type", async () => {
      const handler = makeHandler();
      const result = await handler.execute("test:agent unknown-agent");
      expect(result.content).toContain("Unknown agent type");
    });
  });
});
