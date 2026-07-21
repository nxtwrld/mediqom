import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetDocument, mockLogNamespace } = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockLogNamespace: vi.fn(),
}));

vi.mock("$lib/documents", () => ({
  getDocument: mockGetDocument,
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

// BaseMedicalTool imports these — mock them to avoid side effects
vi.mock("$lib/user", () => ({
  default: {
    subscribe: vi.fn((cb: (v: any) => void) => { cb(null); return () => {}; }),
    getId: vi.fn(() => null),
  },
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

import { GetDocumentByIdTool } from "./get-document-by-id";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeDoc(overrides: Record<string, any> = {}): any {
  return {
    id: "doc-1",
    type: "consultation",
    metadata: {
      title: "Annual Checkup",
      date: "2024-01-15",
      category: "consultation",
      tags: [],
    },
    content: "Patient is in good health.",
    author_id: "user-1",
    medicalTerms: [],
    ...overrides,
  };
}

describe("context/mcp-tools/tools/get-document-by-id", () => {
  let tool: GetDocumentByIdTool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogNamespace.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    });
    tool = new GetDocumentByIdTool();
  });

  // ── getToolDefinition ─────────────────────────────────────────────────────

  describe("getToolDefinition", () => {
    it("returns name getDocumentById", () => {
      expect(tool.getToolDefinition().name).toBe("getDocumentById");
    });

    it("requires documentId parameter", () => {
      const def = tool.getToolDefinition();
      expect(def.inputSchema.required).toContain("documentId");
      expect(def.inputSchema.properties.documentId).toBeDefined();
    });

    it("has a description", () => {
      expect(tool.getToolDefinition().description.length).toBeGreaterThan(0);
    });

    it("inputSchema type is object", () => {
      expect(tool.getToolDefinition().inputSchema.type).toBe("object");
    });
  });

  // ── execute: document not found ───────────────────────────────────────────

  describe("execute — document not found", () => {
    it("returns isError=true when getDocument returns null", async () => {
      mockGetDocument.mockResolvedValue(null);
      const result = await tool.execute({ documentId: "unknown" });
      expect(result.isError).toBe(true);
    });

    it("error text mentions 'not found'", async () => {
      mockGetDocument.mockResolvedValue(null);
      const result = await tool.execute({ documentId: "unknown" });
      expect(result.content[0].text).toContain("not found");
    });

    it("calls getDocument with the provided ID", async () => {
      mockGetDocument.mockResolvedValue(null);
      await tool.execute({ documentId: "doc-42" });
      expect(mockGetDocument).toHaveBeenCalledWith("doc-42");
    });
  });

  // ── execute: document found ───────────────────────────────────────────────

  describe("execute — document found", () => {
    it("returns isError falsy when document exists", async () => {
      mockGetDocument.mockResolvedValue(makeDoc());
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.isError).toBeFalsy();
    });

    it("text content includes document title", async () => {
      mockGetDocument.mockResolvedValue(makeDoc());
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.content[0].text).toContain("Annual Checkup");
    });

    it("text content includes document type", async () => {
      mockGetDocument.mockResolvedValue(makeDoc({ type: "laboratory" }));
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.content[0].text).toContain("laboratory");
    });

    it("text content includes document date", async () => {
      mockGetDocument.mockResolvedValue(makeDoc());
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.content[0].text).toContain("2024-01-15");
    });

    it("includes a resource content item", async () => {
      mockGetDocument.mockResolvedValue(makeDoc());
      const result = await tool.execute({ documentId: "doc-1" });
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource).toBeDefined();
    });

    it("resource contains document id", async () => {
      mockGetDocument.mockResolvedValue(makeDoc());
      const result = await tool.execute({ documentId: "doc-1" });
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.id).toBe("doc-1");
    });

    it("includes medical terms when present", async () => {
      mockGetDocument.mockResolvedValue(
        makeDoc({ medicalTerms: ["glucose", "HbA1c"] }),
      );
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.content[0].text).toContain("glucose");
    });

    it("includes tags when present", async () => {
      mockGetDocument.mockResolvedValue(
        makeDoc({ metadata: { title: "Doc", date: "2024-01-01", tags: ["urgent", "lab"] } }),
      );
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.content[0].text).toContain("urgent");
    });

    it("handles string document content", async () => {
      mockGetDocument.mockResolvedValue(makeDoc({ content: "Plain text content." }));
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain("Plain text");
    });

    it("handles JSON object content with findings/diagnosis/treatment", async () => {
      mockGetDocument.mockResolvedValue(
        makeDoc({
          content: {
            findings: "Normal sinus rhythm",
            diagnosis: "Hypertension",
            treatment: "Lisinopril 10mg",
          },
        }),
      );
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.content[0].text).toContain("Findings");
      expect(result.content[0].text).toContain("Diagnosis");
    });

    it("handles generic JSON object content (no findings/diagnosis/treatment)", async () => {
      mockGetDocument.mockResolvedValue(
        makeDoc({ content: { glucose: 5.4, unit: "mmol/L" } }),
      );
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.isError).toBeFalsy();
    });

    it("sanitizes encryptedData from resource", async () => {
      mockGetDocument.mockResolvedValue(
        makeDoc({ content: { title: "Test", encryptedData: "secret", privateKey: "key" } }),
      );
      const result = await tool.execute({ documentId: "doc-1" });
      const resource = result.content.find((c) => c.type === "resource");
      expect(resource?.resource?.content?.encryptedData).toBeUndefined();
      expect(resource?.resource?.content?.privateKey).toBeUndefined();
    });

    it("handles document without title (falls back to 'Untitled')", async () => {
      mockGetDocument.mockResolvedValue(
        makeDoc({ metadata: { date: "2024-01-01" } }),
      );
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.content[0].text).toContain("Untitled");
    });
  });

  // ── execute: error handling ───────────────────────────────────────────────

  describe("execute — error handling", () => {
    it("returns isError=true when getDocument throws", async () => {
      mockGetDocument.mockRejectedValue(new Error("Network error"));
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.isError).toBe(true);
    });

    it("error text contains error message on throw", async () => {
      mockGetDocument.mockRejectedValue(new Error("Network error"));
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.content[0].text).toContain("Network error");
    });

    it("handles non-Error throws gracefully", async () => {
      mockGetDocument.mockRejectedValue("string error");
      const result = await tool.execute({ documentId: "doc-1" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown error");
    });
  });

  // ── private: formatSection ────────────────────────────────────────────────

  describe("formatSection (private via any)", () => {
    const inst = () => tool as any;

    it("returns string as-is", () => {
      expect(inst().formatSection("hello")).toBe("hello");
    });

    it("formats array with bullet points", () => {
      const result = inst().formatSection(["a", "b"]);
      expect(result).toContain("• a");
      expect(result).toContain("• b");
    });

    it("formats object as key: value pairs", () => {
      const result = inst().formatSection({ foo: "bar" });
      expect(result).toContain("foo");
      expect(result).toContain("bar");
    });

    it("converts number to string", () => {
      expect(inst().formatSection(42)).toBe("42");
    });
  });

  // ── private: sanitizeContentForAI ─────────────────────────────────────────

  describe("sanitizeContentForAI (private via any)", () => {
    const inst = () => tool as any;

    it("returns string content unchanged", () => {
      expect(inst().sanitizeContentForAI("hello")).toBe("hello");
    });

    it("removes encryptedData field", () => {
      const result = inst().sanitizeContentForAI({ data: "ok", encryptedData: "secret" });
      expect(result.data).toBe("ok");
      expect(result.encryptedData).toBeUndefined();
    });

    it("removes privateKey field", () => {
      const result = inst().sanitizeContentForAI({ data: "ok", privateKey: "key" });
      expect(result.privateKey).toBeUndefined();
    });

    it("removes internalNotes field", () => {
      const result = inst().sanitizeContentForAI({ note: "visible", internalNotes: "hidden" });
      expect(result.internalNotes).toBeUndefined();
      expect(result.note).toBe("visible");
    });

    it("passes through null", () => {
      expect(inst().sanitizeContentForAI(null)).toBeNull();
    });

    it("passes through numbers", () => {
      expect(inst().sanitizeContentForAI(42)).toBe(42);
    });
  });
});
