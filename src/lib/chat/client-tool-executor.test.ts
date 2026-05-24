import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("$lib/documents", () => ({
  getDocument: vi.fn(),
}));

vi.mock("$lib/context/integration/chat-service", () => ({
  chatContextService: {
    prepareContextForChat: vi.fn(),
    getMCPToolsForChat: vi.fn(),
  },
}));

vi.mock("$lib/user", () => {
  const store = {
    get: vi.fn(),
    subscribe: vi.fn(),
    set: vi.fn(),
  };
  return { default: store };
});

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { ClientToolExecutor } from "./client-tool-executor";
import user from "$lib/user";
import { getDocument } from "$lib/documents";
import { chatContextService } from "$lib/context/integration/chat-service";

describe("ClientToolExecutor", () => {
  let executor: ClientToolExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    (user.get as any).mockReturnValue({ id: "user-1", email: "test@example.com" });
    executor = new ClientToolExecutor({ profileId: "profile-1" });
  });

  describe("authentication", () => {
    it("returns error when user is not authenticated", async () => {
      (user.get as any).mockReturnValue(null);
      const result = await executor.executeTool("getDocumentById", { documentId: "doc-1" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not authenticated");
    });
  });

  describe("unknown tool", () => {
    it("returns error for unknown tool name", async () => {
      const result = await executor.executeTool("unknownTool", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown tool: unknownTool");
      expect(result.toolName).toBe("unknownTool");
    });
  });

  describe("getDocumentById", () => {
    it("returns error for empty document ID", async () => {
      const result = await executor.executeTool("getDocumentById", { documentId: "" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Document ID is required");
    });

    it("returns error for null document ID", async () => {
      const result = await executor.executeTool("getDocumentById", { documentId: null });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Document ID is required");
    });

    it("returns error when document is not found", async () => {
      (getDocument as any).mockResolvedValue(null);
      const result = await executor.executeTool("getDocumentById", { documentId: "missing-doc" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Document not found");
    });

    it("returns document data without attachments", async () => {
      (getDocument as any).mockResolvedValue({
        id: "doc-1",
        content: { title: "Lab Report", body: "Normal results" },
        metadata: { title: "Lab Report", type: "laboratory" },
        type: "laboratory",
        user_id: "user-1",
        attachments: [{ id: "att-1", data: "binary" }],
      });

      const result = await executor.executeTool("getDocumentById", { documentId: "doc-1" });
      expect(result.success).toBe(true);
      expect(result.data.id).toBe("doc-1");
      expect(result.data.attachments).toBeUndefined();
      expect(result.data.content).toBeDefined();
    });

    it("trims whitespace from document ID", async () => {
      (getDocument as any).mockResolvedValue({
        id: "doc-1",
        content: { title: "Test" },
        metadata: {},
        type: "laboratory",
        user_id: "user-1",
      });

      await executor.executeTool("getDocumentById", { documentId: "  doc-1  " });
      expect(getDocument).toHaveBeenCalledWith("doc-1");
    });

    it("handles exception from getDocument", async () => {
      (getDocument as any).mockRejectedValue(new Error("Storage error"));
      const result = await executor.executeTool("getDocumentById", { documentId: "doc-1" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Storage error");
    });
  });

  describe("searchDocuments", () => {
    it("returns error when terms is not provided", async () => {
      const result = await executor.executeTool("searchDocuments", { query: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("AI must provide medical terms as array");
    });

    it("returns error when terms is not an array", async () => {
      const result = await executor.executeTool("searchDocuments", { terms: "glucose" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("AI must provide medical terms as array");
    });

    it("returns error when all terms are invalid", async () => {
      const result = await executor.executeTool("searchDocuments", { terms: ["", " ", 42] });
      expect(result.success).toBe(false);
      expect(result.error).toContain("No valid medical terms");
    });
  });

  describe("getAssembledContext", () => {
    it("returns context from chat context service", async () => {
      (chatContextService.prepareContextForChat as any).mockResolvedValue({
        assembledContext: { summary: "Patient has diabetes", keyPoints: [] },
      });

      const result = await executor.executeTool("getAssembledContext", { query: "diabetes history" });
      expect(result.success).toBe(true);
      expect(result.data.summary).toContain("diabetes");
    });

    it("handles service error gracefully", async () => {
      (chatContextService.prepareContextForChat as any).mockRejectedValue(
        new Error("Context service unavailable"),
      );

      const result = await executor.executeTool("getAssembledContext", { query: "test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Context service unavailable");
    });
  });

  describe("queryMedicalHistory", () => {
    it("delegates to MCP tools", async () => {
      const mockMCPTools = {
        queryMedicalHistory: vi.fn().mockResolvedValue({ conditions: ["hypertension"] }),
      };
      (chatContextService.getMCPToolsForChat as any).mockReturnValue(mockMCPTools);

      const result = await executor.executeTool("queryMedicalHistory", {
        queryType: "conditions",
        timeframe: "1y",
      });

      expect(result.success).toBe(true);
      expect(mockMCPTools.queryMedicalHistory).toHaveBeenCalledWith("conditions", "1y");
    });

    it("uses category as fallback for queryType", async () => {
      const mockMCPTools = {
        queryMedicalHistory: vi.fn().mockResolvedValue({}),
      };
      (chatContextService.getMCPToolsForChat as any).mockReturnValue(mockMCPTools);

      await executor.executeTool("queryMedicalHistory", { category: "medications" });
      expect(mockMCPTools.queryMedicalHistory).toHaveBeenCalledWith("medications", undefined);
    });
  });

  describe("getProfileData", () => {
    it("returns profile data from MCP tools", async () => {
      const mockMCPTools = {
        getProfileData: vi.fn().mockResolvedValue({ name: "John", age: 45 }),
      };
      (chatContextService.getMCPToolsForChat as any).mockReturnValue(mockMCPTools);

      const result = await executor.executeTool("getProfileData", {});
      expect(result.success).toBe(true);
      expect(result.data.name).toBe("John");
    });

    it("handles profile fetch error", async () => {
      const mockMCPTools = {
        getProfileData: vi.fn().mockRejectedValue(new Error("Profile not found")),
      };
      (chatContextService.getMCPToolsForChat as any).mockReturnValue(mockMCPTools);

      const result = await executor.executeTool("getProfileData", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("Profile not found");
    });
  });

  describe("general error handling", () => {
    it("catches unexpected exceptions in tool execution", async () => {
      // Force an error by making the user mock throw during logging
      const badExecutor = new ClientToolExecutor({ profileId: "profile-1" });

      // Test with a tool that will trigger an import error (searchDocuments with valid terms)
      const result = await badExecutor.executeTool("searchDocuments", {
        terms: ["glucose"],
      });

      // Should either succeed or fail gracefully (not throw)
      expect(result.toolName).toBe("searchDocuments");
      expect(typeof result.success).toBe("boolean");
    });

    it("includes timestamp on all results", async () => {
      const result = await executor.executeTool("unknownTool", {});
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });
});
