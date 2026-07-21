import { describe, it, expect, beforeEach } from "vitest";
import {
  ProgressTracker,
  formatDuration,
  formatFileSize,
} from "./progress-tracker";

// ─── formatDuration ─────────────────────────────────────

describe("formatDuration", () => {
  it("formats seconds under a minute", () => {
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(45000)).toBe("45s");
  });

  it("formats minutes", () => {
    expect(formatDuration(120000)).toBe("2m");
    expect(formatDuration(150000)).toBe("2m 30s");
  });

  it("formats hours", () => {
    expect(formatDuration(3600000)).toBe("1h 0m");
    expect(formatDuration(5400000)).toBe("1h 30m");
  });

  it("rounds to nearest second", () => {
    expect(formatDuration(1500)).toBe("2s");
    expect(formatDuration(500)).toBe("1s");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

// ─── formatFileSize ─────────────────────────────────────

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });

  it("handles zero", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
});

// ─── ProgressTracker ────────────────────────────────────

describe("ProgressTracker", () => {
  let tracker: ProgressTracker;

  function makeFile(name: string, size = 1024): File {
    return new File(["content"], name, { type: "application/pdf" });
  }

  beforeEach(() => {
    tracker = new ProgressTracker();
  });

  describe("initialization", () => {
    it("starts empty", () => {
      expect(tracker.getAllFiles()).toEqual([]);
      expect(tracker.isComplete()).toBe(false);
      expect(tracker.hasErrors()).toBe(false);
    });

    it("initializes files from File array", () => {
      tracker.initializeFiles([makeFile("doc1.pdf"), makeFile("doc2.pdf")]);
      expect(tracker.getAllFiles().length).toBe(2);
      expect(tracker.getAllFiles()[0].stage).toBe("extract");
      expect(tracker.getAllFiles()[0].progress).toBe(0);
    });
  });

  describe("updateFileProgress", () => {
    it("updates progress for a known file", () => {
      tracker.initializeFiles([makeFile("doc.pdf")]);
      const fileId = tracker.getAllFiles()[0].fileId;

      tracker.updateFileProgress({
        type: "progress",
        fileId,
        stage: "extracting text",
        progress: 50,
        message: "Extracting text...",
        timestamp: Date.now(),
      });

      const file = tracker.getFile(fileId);
      expect(file?.progress).toBe(50);
      expect(file?.stage).toBe("extract");
    });

    it("ignores events without fileId", () => {
      tracker.initializeFiles([makeFile("doc.pdf")]);
      tracker.updateFileProgress({
        type: "progress",
        stage: "extract",
        progress: 50,
        message: "test",
      } as any);
      // Should not throw
    });

    it("clamps progress to 0-100", () => {
      tracker.initializeFiles([makeFile("doc.pdf")]);
      const fileId = tracker.getAllFiles()[0].fileId;

      tracker.updateFileProgress({
        type: "progress",
        fileId,
        stage: "extract",
        progress: 150,
        message: "test",
        timestamp: Date.now(),
      });

      expect(tracker.getFile(fileId)?.progress).toBe(100);
    });

    it("parses analyze stage correctly", () => {
      tracker.initializeFiles([makeFile("doc.pdf")]);
      const fileId = tracker.getAllFiles()[0].fileId;

      tracker.updateFileProgress({
        type: "progress",
        fileId,
        stage: "analyzing medical content",
        progress: 30,
        message: "Analyzing...",
        timestamp: Date.now(),
      });

      expect(tracker.getFile(fileId)?.stage).toBe("analyze");
    });

    it("sets error on error event type", () => {
      tracker.initializeFiles([makeFile("doc.pdf")]);
      const fileId = tracker.getAllFiles()[0].fileId;

      tracker.updateFileProgress({
        type: "error",
        fileId,
        stage: "error occurred",
        progress: 0,
        message: "File corrupted",
        timestamp: Date.now(),
      });

      expect(tracker.getFile(fileId)?.stage).toBe("error");
      expect(tracker.getFile(fileId)?.error).toBe("File corrupted");
    });
  });

  describe("markFileComplete / markFileError", () => {
    it("marks a file as complete", () => {
      tracker.initializeFiles([makeFile("doc.pdf")]);
      const fileId = tracker.getAllFiles()[0].fileId;

      tracker.markFileComplete(fileId);
      const file = tracker.getFile(fileId);
      expect(file?.stage).toBe("complete");
      expect(file?.progress).toBe(100);
      expect(file?.endTime).toBeDefined();
    });

    it("marks a file as error", () => {
      tracker.initializeFiles([makeFile("doc.pdf")]);
      const fileId = tracker.getAllFiles()[0].fileId;

      tracker.markFileError(fileId, "OCR failed");
      const file = tracker.getFile(fileId);
      expect(file?.stage).toBe("error");
      expect(file?.error).toBe("OCR failed");
    });

    it("ignores unknown file IDs", () => {
      tracker.markFileComplete("nonexistent");
      // Should not throw
    });
  });

  describe("isComplete / hasErrors", () => {
    it("isComplete returns true when all files complete", () => {
      tracker.initializeFiles([makeFile("a.pdf"), makeFile("b.pdf")]);
      const files = tracker.getAllFiles();
      files.forEach((f) => tracker.markFileComplete(f.fileId));
      expect(tracker.isComplete()).toBe(true);
    });

    it("isComplete returns false when files still processing", () => {
      tracker.initializeFiles([makeFile("a.pdf")]);
      expect(tracker.isComplete()).toBe(false);
    });

    it("hasErrors returns true when any file errored", () => {
      tracker.initializeFiles([makeFile("a.pdf"), makeFile("b.pdf")]);
      const files = tracker.getAllFiles();
      tracker.markFileError(files[0].fileId, "error");
      expect(tracker.hasErrors()).toBe(true);
    });
  });

  describe("getFilesByStage", () => {
    it("returns files filtered by stage", () => {
      tracker.initializeFiles([makeFile("a.pdf"), makeFile("b.pdf"), makeFile("c.pdf")]);
      const files = tracker.getAllFiles();
      tracker.markFileComplete(files[0].fileId);
      tracker.markFileError(files[1].fileId, "fail");

      expect(tracker.getFilesByStage("complete").length).toBe(1);
      expect(tracker.getFilesByStage("error").length).toBe(1);
      expect(tracker.getFilesByStage("extract").length).toBe(1);
    });
  });

  describe("getStats", () => {
    it("computes statistics correctly", () => {
      tracker.initializeFiles([makeFile("a.pdf"), makeFile("b.pdf"), makeFile("c.pdf")]);
      const files = tracker.getAllFiles();
      tracker.markFileComplete(files[0].fileId);
      tracker.markFileError(files[1].fileId, "fail");

      const stats = tracker.getStats();
      expect(stats.totalFiles).toBe(3);
      expect(stats.completedFiles).toBe(1);
      expect(stats.erroredFiles).toBe(1);
      expect(stats.inProgressFiles).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears all tracked files", () => {
      tracker.initializeFiles([makeFile("doc.pdf")]);
      tracker.reset();
      expect(tracker.getAllFiles()).toEqual([]);
    });
  });

  describe("getCurrentProgress", () => {
    it("returns current snapshot", () => {
      tracker.initializeFiles([makeFile("doc.pdf")]);
      const { overall, files } = tracker.getCurrentProgress();
      expect(overall.filesTotal).toBe(1);
      expect(overall.stage).toBe("extract");
      expect(files.size).toBe(1);
    });
  });
});
