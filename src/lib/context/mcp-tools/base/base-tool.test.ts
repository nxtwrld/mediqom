import { describe, it, expect, vi } from "vitest";
import { readable } from "svelte/store";

vi.mock("$lib/documents", () => ({
  byUser: vi.fn().mockReturnValue(readable([])),
  getDocument: vi.fn(),
}));
vi.mock("$lib/user", () => ({ default: readable(null) }));
vi.mock("$lib/profiles", () => ({ profiles: readable([]) }));
vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));
vi.mock("../security-audit", () => ({
  mcpSecurityService: {
    validateAccess: vi.fn().mockResolvedValue({ allowed: true }),
    logAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

import { BaseMedicalTool, type MCPTool, type MCPToolResult } from "./base-tool";

// Minimal concrete subclass for testing
class TestTool extends BaseMedicalTool {
  getToolDefinition(): MCPTool {
    return {
      name: "test-tool",
      description: "Test",
      inputSchema: { type: "object", properties: {} },
    };
  }
  async execute(_params: any, _profileId: string): Promise<MCPToolResult> {
    return { content: [{ type: "text", text: "ok" }] };
  }
}

const tool = new TestTool();

describe("context/mcp-tools/base/base-tool — BaseMedicalTool", () => {
  // ── extractDataAccessInfo ─────────────────────────────────────────────────

  describe("extractDataAccessInfo", () => {
    it("returns empty array for null/undefined", () => {
      expect((tool as any).extractDataAccessInfo(null)).toEqual([]);
      expect((tool as any).extractDataAccessInfo(undefined)).toEqual([]);
    });

    it("describes content array length", () => {
      const info = (tool as any).extractDataAccessInfo({
        content: ["a", "b", "c"],
      });
      expect(info).toContain("3 content items");
    });

    it("describes documentCount", () => {
      const info = (tool as any).extractDataAccessInfo({ documentCount: 7 });
      expect(info).toContain("7 documents");
    });

    it("describes medications array length", () => {
      const info = (tool as any).extractDataAccessInfo({
        medications: [{ name: "Metformin" }, { name: "Aspirin" }],
      });
      expect(info).toContain("2 medications");
    });

    it("describes testResults array length", () => {
      const info = (tool as any).extractDataAccessInfo({
        testResults: [{ name: "Glucose" }],
      });
      expect(info).toContain("1 test results");
    });

    it("combines multiple fields", () => {
      const info = (tool as any).extractDataAccessInfo({
        content: ["x"],
        documentCount: 3,
        medications: [{ name: "A" }, { name: "B" }],
      });
      expect(info.length).toBe(3);
    });
  });

  // ── extractDocumentDate ───────────────────────────────────────────────────

  describe("extractDocumentDate", () => {
    it("extracts date from metadata.date", () => {
      const date = (tool as any).extractDocumentDate({
        metadata: { date: "2023-06-15" },
      });
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2023);
    });

    it("extracts date from metadata.created_at", () => {
      const date = (tool as any).extractDocumentDate({
        metadata: { created_at: "2024-03-01T10:00:00Z" },
      });
      expect(date).toBeInstanceOf(Date);
    });

    it("extracts date from top-level created_at", () => {
      const date = (tool as any).extractDocumentDate({
        created_at: "2022-12-25",
      });
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2022);
    });

    it("extracts date from metadata.timestamp", () => {
      const date = (tool as any).extractDocumentDate({
        metadata: { timestamp: "2021-07-04" },
      });
      expect(date).toBeInstanceOf(Date);
    });

    it("returns null when no date field is present", () => {
      const date = (tool as any).extractDocumentDate({ id: "doc-1" });
      expect(date).toBeNull();
    });

    it("returns null for unparseable date string", () => {
      const date = (tool as any).extractDocumentDate({
        metadata: { date: "not-a-date" },
      });
      expect(date).toBeNull();
    });

    it("prefers metadata.date over created_at", () => {
      const date = (tool as any).extractDocumentDate({
        metadata: { date: "2023-01-01" },
        created_at: "2022-01-01",
      });
      expect(date.getFullYear()).toBe(2023);
    });
  });

  // ── classifyDocumentByDate ────────────────────────────────────────────────

  describe("classifyDocumentByDate", () => {
    it("classifies the most recent document as 'latest'", () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastMonth = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

      // `now` is the newest (top 10% of 3 docs = top 1)
      const classification = (tool as any).classifyDocumentByDate(now, [
        { metadata: { date: now.toISOString() } },
        { metadata: { date: yesterday.toISOString() } },
        { metadata: { date: lastMonth.toISOString() } },
      ]);

      expect(classification).toBe("latest");
    });

    it("classifies documents within last 30 days (but not latest) as 'recent'", () => {
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const lastYear = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      // Newest is fiveDaysAgo, tenDaysAgo is not in top 10%
      const classification = (tool as any).classifyDocumentByDate(tenDaysAgo, [
        { metadata: { date: fiveDaysAgo.toISOString() } },
        { metadata: { date: tenDaysAgo.toISOString() } },
        { metadata: { date: lastYear.toISOString() } },
      ]);

      expect(classification).toBe("recent");
    });

    it("classifies old documents as 'historical'", () => {
      const oldDate = new Date("2020-01-01");
      const now = new Date();

      const classification = (tool as any).classifyDocumentByDate(oldDate, [
        { metadata: { date: now.toISOString() } },
        { metadata: { date: oldDate.toISOString() } },
      ]);

      expect(classification).toBe("historical");
    });

    it("returns 'historical' when document list has no parseable dates", () => {
      const date = new Date("2023-01-01");
      const classification = (tool as any).classifyDocumentByDate(date, [
        { metadata: {} }, // no date
        { id: "doc-no-dates" },
      ]);

      expect(classification).toBe("historical");
    });
  });

  // ── secureToolCall ────────────────────────────────────────────────────────

  describe("secureToolCall", () => {
    it("executes handler when access is allowed and returns result", async () => {
      const { mcpSecurityService } = await import("../security-audit");
      vi.mocked(mcpSecurityService.validateAccess).mockResolvedValue({
        allowed: true,
      });

      const result = await (tool as any).secureToolCall(
        "test-tool",
        "read",
        { profileId: "p1", userId: "u1" },
        {},
        async () => "handler-result",
      );

      expect(result).toBe("handler-result");
      expect(mcpSecurityService.logAccess).toHaveBeenCalledWith(
        "test-tool",
        "read",
        expect.any(Object),
        {},
        "success",
        undefined,
        expect.any(Array),
        expect.any(Number),
      );
    });

    it("throws and logs denial when access is denied", async () => {
      const { mcpSecurityService } = await import("../security-audit");
      vi.mocked(mcpSecurityService.validateAccess).mockResolvedValue({
        allowed: false,
        reason: "Unauthorized profile access",
      });

      await expect(
        (tool as any).secureToolCall(
          "test-tool",
          "read",
          { profileId: "p1" },
          {},
          async () => "never",
        ),
      ).rejects.toThrow("Access denied: Unauthorized profile access");

      expect(mcpSecurityService.logAccess).toHaveBeenCalledWith(
        "test-tool",
        "read",
        expect.any(Object),
        {},
        "denied",
        "Unauthorized profile access",
        [],
        expect.any(Number),
      );
    });

    it("logs error and rethrows when handler throws", async () => {
      const { mcpSecurityService } = await import("../security-audit");
      vi.mocked(mcpSecurityService.validateAccess).mockResolvedValue({
        allowed: true,
      });

      await expect(
        (tool as any).secureToolCall(
          "test-tool",
          "read",
          { profileId: "p1" },
          {},
          async () => {
            throw new Error("Handler crashed");
          },
        ),
      ).rejects.toThrow("Handler crashed");

      expect(mcpSecurityService.logAccess).toHaveBeenCalledWith(
        "test-tool",
        "read",
        expect.any(Object),
        {},
        "error",
        "Handler crashed",
        [],
        expect.any(Number),
      );
    });
  });
});
