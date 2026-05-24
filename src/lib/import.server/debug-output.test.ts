import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockWriteFileSync, mockMkdirSync } = vi.hoisted(() => ({
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
}));

vi.mock("fs", () => ({
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

vi.mock("$env/static/private", () => ({
  DEBUG_IMPORT: "true",
}));

import {
  saveExtractionResults,
  saveAnalysisResults,
  saveCompleteWorkflow,
  saveDocumentWorkflow,
  saveImportPhaseLog,
  saveNodeResult,
} from "./debug-output";

describe("import.server/debug-output", () => {
  beforeEach(() => {
    mockWriteFileSync.mockReset();
    mockMkdirSync.mockReset();
  });

  describe("saveExtractionResults", () => {
    it("writes extraction results when enabled", () => {
      saveExtractionResults("job-1", [{ pages: [1, 2] }, { pages: [3] }], {
        enabled: true,
        prettyPrint: false,
      });

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.jobId).toBe("job-1");
      expect(written.metadata.fileCount).toBe(2);
      expect(written.metadata.totalPages).toBe(3);
    });

    it("does nothing when disabled", () => {
      saveExtractionResults("job-1", [], { enabled: false });
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("pretty prints when configured", () => {
      saveExtractionResults("job-1", [], { enabled: true, prettyPrint: true });
      const written = mockWriteFileSync.mock.calls[0][1];
      expect(written).toContain("\n"); // pretty-printed has newlines
    });

    it("does not throw on fs error", () => {
      mockMkdirSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      // Should not throw
      saveExtractionResults("job-1", [], { enabled: true });
    });
  });

  describe("saveAnalysisResults", () => {
    it("writes analysis results with metadata", () => {
      saveAnalysisResults(
        "job-2",
        [
          { isMedical: true, signals: [{ name: "HR" }] },
          { isMedical: false, signals: [] },
        ],
        { enabled: true, prettyPrint: false },
      );

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.metadata.documentCount).toBe(2);
      expect(written.metadata.medicalCount).toBe(1);
      expect(written.metadata.hasSignals).toBe(1);
    });

    it("does nothing when disabled", () => {
      saveAnalysisResults("job-2", [], { enabled: false });
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe("saveCompleteWorkflow", () => {
    it("writes complete workflow without state by default", () => {
      saveCompleteWorkflow("job-3", [{ pages: [1] }], [{ isMedical: true }], undefined, {
        enabled: true,
        prettyPrint: false,
      });

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.metadata.extractionCount).toBe(1);
      expect(written.metadata.analysisCount).toBe(1);
      expect(written.workflowState).toBeUndefined();
    });

    it("includes workflow state when configured", () => {
      saveCompleteWorkflow("job-3", [], [], { step: "done" }, {
        enabled: true,
        prettyPrint: false,
        includeWorkflowState: true,
      });

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.workflowState).toEqual({ step: "done" });
    });
  });

  describe("saveDocumentWorkflow", () => {
    it("writes document workflow result", () => {
      saveDocumentWorkflow("job-4", 2, { result: "ok" }, {
        enabled: true,
        prettyPrint: false,
      });

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.jobId).toBe("job-4");
      expect(written.documentIndex).toBe(2);
      expect(written.workflowResult).toEqual({ result: "ok" });
    });
  });

  describe("saveImportPhaseLog", () => {
    it("writes phase log", () => {
      saveImportPhaseLog("job-5", 0, "ocr", { text: "hello" }, {
        enabled: true,
        prettyPrint: false,
      });

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    });

    it("silently ignores errors", () => {
      mockMkdirSync.mockImplementation(() => {
        throw new Error("fail");
      });

      // Should not throw
      saveImportPhaseLog("job-5", 0, "ocr", {}, { enabled: true });
    });
  });

  describe("saveNodeResult", () => {
    it("writes node result to workflows/nodes directory", () => {
      saveNodeResult("job-6", "extract", { data: "test" }, "2024-01-01", {
        enabled: true,
        prettyPrint: false,
      });

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.jobId).toBe("job-6");
      expect(written.nodeName).toBe("extract");
      expect(written.output).toEqual({ data: "test" });
    });

    it("generates timestamp if not provided", () => {
      saveNodeResult("job-6", "analyze", { ok: true }, undefined, {
        enabled: true,
        prettyPrint: false,
      });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    });
  });
});
