import { describe, it, expect, vi, beforeEach } from "vitest";
import { readable } from "svelte/store";

const { mockGetContextStats, mockByUser, mockLogNamespace } = vi.hoisted(() => ({
  mockGetContextStats: vi.fn(),
  mockByUser: vi.fn(),
  mockLogNamespace: vi.fn(),
}));

vi.mock("$lib/context/integration/profile-context", () => ({
  profileContextManager: {
    getContextStats: mockGetContextStats,
  },
}));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: mockLogNamespace.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// BaseMedicalTool peer imports
vi.mock("$lib/user", () => ({
  default: {
    subscribe: vi.fn((cb: (v: any) => void) => { cb(null); return () => {}; }),
    getId: vi.fn(() => null),
  },
}));

vi.mock("$lib/documents", () => ({
  byUser: mockByUser,
  getDocument: vi.fn().mockResolvedValue(null),
}));

vi.mock("$lib/profiles", () => ({
  profiles: {
    subscribe: vi.fn((cb: (v: any) => void) => { cb([]); return () => {}; }),
  },
}));

vi.mock("../security-audit", () => ({
  mcpSecurityService: {
    validateAccess: vi.fn().mockResolvedValue({ allowed: true }),
    logAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("$lib/config/classification", () => ({
  classificationConfig: {
    categories: {},
    temporalTerms: {},
  },
}));

import { QueryMedicalHistoryTool } from "./query-medical-history";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSearchResult(overrides: Record<string, any> = {}): any {
  return {
    documentId: "doc-1",
    similarity: 0.8,
    metadata: {
      title: "Lab Result",
      date: "2024-01-15",
      documentType: "laboratory",
    },
    excerpt: "Patient medication prescribed for hypertension diagnosis.",
    ...overrides,
  };
}

function makeContextStats(searchResults: any[] = []): any {
  const mockSearch = vi.fn().mockResolvedValue(searchResults);
  return {
    totalDocuments: searchResults.length,
    database: { search: mockSearch },
    _mockSearch: mockSearch,
  };
}

describe("context/mcp-tools/tools/query-medical-history", () => {
  let tool: QueryMedicalHistoryTool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogNamespace.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    });
    tool = new QueryMedicalHistoryTool();
    mockByUser.mockReturnValue(readable([]));
    mockGetContextStats.mockReturnValue(null);
  });

  // ── getToolDefinition ─────────────────────────────────────────────────────

  describe("getToolDefinition", () => {
    it("returns name queryMedicalHistory", () => {
      expect(tool.getToolDefinition().name).toBe("queryMedicalHistory");
    });

    it("requires queryType parameter", () => {
      const def = tool.getToolDefinition();
      expect(def.inputSchema.required).toContain("queryType");
    });

    it("queryType enum contains expected values", () => {
      const props = tool.getToolDefinition().inputSchema.properties;
      const enumValues = props.queryType.enum;
      expect(enumValues).toContain("medications");
      expect(enumValues).toContain("conditions");
      expect(enumValues).toContain("procedures");
      expect(enumValues).toContain("allergies");
      expect(enumValues).toContain("timeline");
    });

    it("has a timeframe property", () => {
      const props = tool.getToolDefinition().inputSchema.properties;
      expect(props.timeframe).toBeDefined();
    });

    it("has a description", () => {
      expect(tool.getToolDefinition().description.length).toBeGreaterThan(0);
    });
  });

  // ── execute: no context stats ─────────────────────────────────────────────

  describe("execute — no context stats", () => {
    it("returns isError=true when getContextStats returns null", async () => {
      mockGetContextStats.mockReturnValue(null);
      const result = await tool.execute({ queryType: "medications" }, "p1");
      expect(result.isError).toBe(true);
    });

    it("error text mentions 'No medical history context'", async () => {
      mockGetContextStats.mockReturnValue(null);
      const result = await tool.execute({ queryType: "medications" }, "p1");
      expect(result.content[0].text).toContain("No medical history context");
    });

    it("calls getContextStats with profileId", async () => {
      mockGetContextStats.mockReturnValue(null);
      await tool.execute({ queryType: "medications" }, "profile-xyz");
      expect(mockGetContextStats).toHaveBeenCalledWith("profile-xyz");
    });
  });

  // ── execute: query types ──────────────────────────────────────────────────

  describe("execute — query types", () => {
    it.each(["medications", "conditions", "procedures", "allergies", "timeline"])(
      "calls database.search for queryType=%s",
      async (queryType) => {
        const stats = makeContextStats([]);
        mockGetContextStats.mockReturnValue(stats);
        await tool.execute({ queryType }, "p1");
        expect(stats._mockSearch).toHaveBeenCalled();
      },
    );

    it("returns success for medications query", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "patient medication prescribed." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "medications" }, "p1");
      expect(result.isError).toBeFalsy();
    });

    it("returns success for conditions query", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "patient diagnosis confirmed condition." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "conditions" }, "p1");
      expect(result.isError).toBeFalsy();
    });

    it("returns success for procedures query", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "patient underwent surgery procedure." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "procedures" }, "p1");
      expect(result.isError).toBeFalsy();
    });

    it("returns success for allergies query", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "patient allergic to penicillin allergy." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "allergies" }, "p1");
      expect(result.isError).toBeFalsy();
    });

    it("returns success for timeline query", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "Medical event on this date." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "timeline" }, "p1");
      expect(result.isError).toBeFalsy();
    });
  });

  // ── execute: text output ──────────────────────────────────────────────────

  describe("execute — text output", () => {
    it("includes queryType in summary text", async () => {
      const stats = makeContextStats([]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "medications" }, "p1");
      expect(result.content[0].text).toContain("medications");
    });

    it("includes found document count in text", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "medication prescribed." }),
        makeSearchResult({ documentId: "doc-2", excerpt: "another medication." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "medications" }, "p1");
      expect(result.content[0].text).toContain("Found");
    });

    it("includes a resource content item", async () => {
      const stats = makeContextStats([]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "conditions" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource).toBeDefined();
    });

    it("resource contains queryType", async () => {
      const stats = makeContextStats([]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "allergies" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.queryType).toBe("allergies");
    });

    it("resource contains documents array", async () => {
      const stats = makeContextStats([makeSearchResult()]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "timeline" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(Array.isArray(resource?.resource?.documents)).toBe(true);
    });

    it("resource documents list is capped at 10", async () => {
      const results = Array.from({ length: 20 }, (_, i) =>
        makeSearchResult({ documentId: `doc-${i}` }),
      );
      const stats = makeContextStats(results);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "timeline" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.documents.length).toBeLessThanOrEqual(10);
    });
  });

  // ── execute: timeframe filtering ──────────────────────────────────────────

  describe("execute — timeframe filtering", () => {
    it("filters out documents before timeframe start", async () => {
      const results = [
        makeSearchResult({ documentId: "doc-recent", metadata: { date: "2024-06-01", title: "Recent" } }),
        makeSearchResult({ documentId: "doc-old", metadata: { date: "2018-01-01", title: "Old" } }),
      ];
      const stats = makeContextStats(results);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute(
        { queryType: "timeline", timeframe: { start: "2022-01-01" } },
        "p1",
      );
      const resource = result.content.find((c) => c.type === "resource");
      const docIds = resource?.resource?.documents?.map((d: any) => d.id) ?? [];
      expect(docIds).toContain("doc-recent");
      expect(docIds).not.toContain("doc-old");
    });

    it("filters out documents after timeframe end", async () => {
      const results = [
        makeSearchResult({ documentId: "doc-recent", metadata: { date: "2024-06-01", title: "Recent" } }),
        makeSearchResult({ documentId: "doc-old", metadata: { date: "2018-01-01", title: "Old" } }),
      ];
      const stats = makeContextStats(results);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute(
        { queryType: "timeline", timeframe: { end: "2021-01-01" } },
        "p1",
      );
      const resource = result.content.find((c) => c.type === "resource");
      const docIds = resource?.resource?.documents?.map((d: any) => d.id) ?? [];
      expect(docIds).toContain("doc-old");
      expect(docIds).not.toContain("doc-recent");
    });

    it("records timeframe in resource", async () => {
      const stats = makeContextStats([]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute(
        { queryType: "procedures", timeframe: { start: "2023-01-01", end: "2024-12-31" } },
        "p1",
      );
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.timeframe?.start).toBe("2023-01-01");
      expect(resource?.resource?.timeframe?.end).toBe("2024-12-31");
    });

    it("includes timeframe in summary text when provided", async () => {
      const stats = makeContextStats([]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute(
        { queryType: "medications", timeframe: { start: "2023-01-01", end: "2024-12-31" } },
        "p1",
      );
      expect(result.content[0].text).toContain("2023-01-01");
    });
  });

  // ── execute: data extraction per queryType ────────────────────────────────

  describe("execute — extracted data from excerpts", () => {
    it("extracts medication entry when excerpt contains 'medication'", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "Patient is taking medication lisinopril daily." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "medications" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.extractedData?.length).toBeGreaterThan(0);
      expect(resource?.resource?.extractedData?.[0]?.type).toBe("medication");
    });

    it("extracts condition entry when excerpt contains 'diagnosis'", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "Patient diagnosis shows hypertension condition." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "conditions" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.extractedData?.length).toBeGreaterThan(0);
      expect(resource?.resource?.extractedData?.[0]?.type).toBe("condition");
    });

    it("extracts procedure entry when excerpt contains 'procedure'", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "Surgical procedure performed successfully." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "procedures" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.extractedData?.length).toBeGreaterThan(0);
      expect(resource?.resource?.extractedData?.[0]?.type).toBe("procedure");
    });

    it("extracts allergy entry when excerpt contains 'allerg'", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "Patient is allergic to aspirin." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "allergies" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.extractedData?.length).toBeGreaterThan(0);
      expect(resource?.resource?.extractedData?.[0]?.type).toBe("allergy");
    });

    it("all documents contribute to timeline query regardless of content", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "Generic medical visit." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "timeline" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.extractedData?.length).toBeGreaterThan(0);
      expect(resource?.resource?.extractedData?.[0]?.type).toBe("timeline_event");
    });

    it("no extracted data when excerpt doesn't match queryType", async () => {
      const stats = makeContextStats([
        makeSearchResult({ excerpt: "Patient came for routine checkup today." }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "medications" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      // No medication-related text in excerpt
      expect(resource?.resource?.extractedData?.length).toBe(0);
    });

    it("sorts extracted data newest first", async () => {
      const stats = makeContextStats([
        makeSearchResult({
          documentId: "old",
          excerpt: "Patient medication dose.",
          metadata: { date: "2020-01-01", title: "Old" },
        }),
        makeSearchResult({
          documentId: "new",
          excerpt: "Patient prescription medication.",
          metadata: { date: "2024-06-01", title: "New" },
        }),
      ]);
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "medications" }, "p1");
      const resource = result.content.find((c) => c.type === "resource");
      const data = resource?.resource?.extractedData ?? [];
      if (data.length >= 2) {
        expect(new Date(data[0].date).getTime()).toBeGreaterThanOrEqual(
          new Date(data[1].date).getTime(),
        );
      }
    });
  });

  // ── execute: error handling ───────────────────────────────────────────────

  describe("execute — error handling", () => {
    it("returns isError=true when getContextStats throws", async () => {
      mockGetContextStats.mockImplementation(() => { throw new Error("Context error"); });
      const result = await tool.execute({ queryType: "medications" }, "p1");
      expect(result.isError).toBe(true);
    });

    it("error text contains error message", async () => {
      mockGetContextStats.mockImplementation(() => { throw new Error("Context error"); });
      const result = await tool.execute({ queryType: "medications" }, "p1");
      expect(result.content[0].text).toContain("Context error");
    });

    it("returns isError=true when database.search throws", async () => {
      const stats = {
        database: {
          search: vi.fn().mockRejectedValue(new Error("Search failure")),
        },
      };
      mockGetContextStats.mockReturnValue(stats);
      const result = await tool.execute({ queryType: "medications" }, "p1");
      expect(result.isError).toBe(true);
    });

    it("handles non-Error throws gracefully", async () => {
      mockGetContextStats.mockImplementation(() => { throw "string error"; });
      const result = await tool.execute({ queryType: "medications" }, "p1");
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown error");
    });
  });

  // ── private: formatExtractedItem ──────────────────────────────────────────

  describe("formatExtractedItem (private via any)", () => {
    const inst = () => tool as any;

    it("returns content substring when present", () => {
      const item = { content: "Patient takes lisinopril 10mg daily for blood pressure management." };
      const result = inst().formatExtractedItem(item, "medications");
      expect(result).toContain("Patient takes");
      expect(result.endsWith("...")).toBe(true);
    });

    it("returns fallback string when no content", () => {
      const item = { date: "2024-01-01" };
      const result = inst().formatExtractedItem(item, "medications");
      expect(result).toContain("medications");
    });
  });
});
