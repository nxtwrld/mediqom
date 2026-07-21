import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetHealthDocument, mockUpdateDocument, mockProfilesGet, mockUpdateProfile } =
  vi.hoisted(() => ({
    mockGetHealthDocument: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockProfilesGet: vi.fn(),
    mockUpdateProfile: vi.fn(),
  }));

vi.mock("./signals", () => ({
  getHealthDocument: mockGetHealthDocument,
}));

vi.mock("$lib/documents", () => ({
  updateDocument: mockUpdateDocument,
}));

vi.mock("$lib/profiles", () => ({
  profiles: { get: mockProfilesGet, subscribe: vi.fn() },
  updateProfile: mockUpdateProfile,
}));

vi.mock("$lib/logging/logger", () => ({
  log: {
    namespace: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    storage: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
}));

// Minimal mock for definitions.json - just needs to be an array
vi.mock("./definitions.json", () => ({
  default: [
    { key: "height", unit: "cm", type: "single" },
    { key: "weight", unit: "kg", type: "single" },
    { key: "blood_pressure", unit: "mmHg", type: "time-series", items: [{ key: "systolic", unit: "mmHg" }] },
  ],
}));

import {
  addSignalEntry,
  updateSignalEntry,
  deleteSignalEntry,
  addSignalEntriesBatch,
  getSignalValues,
} from "./signal-crud";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeHealthDoc(signals: Record<string, any> = {}) {
  return {
    id: "health-doc-1",
    content: {
      title: "Health Data",
      signals,
    },
  };
}

function makeSignalEntry(overrides: Record<string, any> = {}) {
  return {
    date: "2024-01-15",
    value: 75,
    unit: "",
    reference: "",
    source: "input",
    ...overrides,
  };
}

describe("health/signal-crud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDocument.mockResolvedValue({ id: "health-doc-1" });
    mockProfilesGet.mockResolvedValue(null);
    mockUpdateProfile.mockReturnValue(undefined);
  });

  // ── addSignalEntry ────────────────────────────────────────────────────────

  describe("addSignalEntry", () => {
    it("returns error when health document not found", async () => {
      mockGetHealthDocument.mockResolvedValue(null);

      const result = await addSignalEntry("p1", "weight", makeSignalEntry());
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("adds entry to existing signal values", async () => {
      const doc = makeHealthDoc({
        weight: { log: "full", history: [], values: [] },
      });
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await addSignalEntry("p1", "weight", makeSignalEntry({ value: 80 }));
      expect(result.success).toBe(true);
      expect(mockUpdateDocument).toHaveBeenCalledOnce();
    });

    it("initializes signals object when absent", async () => {
      const doc = makeHealthDoc();
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await addSignalEntry("p1", "height", makeSignalEntry());
      expect(result.success).toBe(true);
      expect(doc.content.signals).toBeDefined();
      expect(doc.content.signals["height"]).toBeDefined();
    });

    it("initializes signal structure when signal is new", async () => {
      const doc = makeHealthDoc({ weight: { log: "full", history: [], values: [] } });
      mockGetHealthDocument.mockResolvedValue(doc);

      await addSignalEntry("p1", "height", makeSignalEntry());
      expect(doc.content.signals["height"].values).toBeDefined();
    });

    it("sets signal name on entry", async () => {
      const doc = makeHealthDoc();
      mockGetHealthDocument.mockResolvedValue(doc);

      await addSignalEntry("p1", "weight", makeSignalEntry());
      const entry = doc.content.signals["weight"].values[0];
      expect(entry.signal).toBe("weight");
    });

    it("uses known unit from definitions when unit not provided", async () => {
      const doc = makeHealthDoc();
      mockGetHealthDocument.mockResolvedValue(doc);

      await addSignalEntry("p1", "height", { date: "2024-01-15", value: 180, unit: "", reference: "" });
      const entry = doc.content.signals["height"].values[0];
      expect(entry.unit).toBe("cm");
    });

    it("sorts values by date descending after insert", async () => {
      const existingEntry = { date: "2023-01-01", value: 70, signal: "weight", source: "input" };
      const doc = makeHealthDoc({
        weight: { log: "full", history: [], values: [existingEntry] },
      });
      mockGetHealthDocument.mockResolvedValue(doc);

      await addSignalEntry("p1", "weight", makeSignalEntry({ date: "2024-06-01", value: 75 }));
      const values = doc.content.signals["weight"].values;
      expect(new Date(values[0].date).getTime()).toBeGreaterThanOrEqual(
        new Date(values[1].date).getTime(),
      );
    });

    it("updates profile store after saving document", async () => {
      const doc = makeHealthDoc();
      mockGetHealthDocument.mockResolvedValue(doc);
      const profile = { id: "p1", health: {} };
      mockProfilesGet.mockResolvedValue(profile);

      await addSignalEntry("p1", "weight", makeSignalEntry());
      expect(mockUpdateProfile).toHaveBeenCalledWith(profile);
    });

    it("returns success even if profile not found", async () => {
      const doc = makeHealthDoc();
      mockGetHealthDocument.mockResolvedValue(doc);
      mockProfilesGet.mockResolvedValue(null);

      const result = await addSignalEntry("p1", "weight", makeSignalEntry());
      expect(result.success).toBe(true);
    });

    it("returns error on exception", async () => {
      mockGetHealthDocument.mockRejectedValue(new Error("DB error"));

      const result = await addSignalEntry("p1", "weight", makeSignalEntry());
      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });
  });

  // ── updateSignalEntry ─────────────────────────────────────────────────────

  describe("updateSignalEntry", () => {
    it("returns error when health document not found", async () => {
      mockGetHealthDocument.mockResolvedValue(null);

      const result = await updateSignalEntry("p1", "weight", 0, { value: 80 });
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("returns error when signal or entry not found", async () => {
      const doc = makeHealthDoc({ weight: { values: [] } });
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await updateSignalEntry("p1", "weight", 0, { value: 80 });
      expect(result.success).toBe(false);
    });

    it("returns error for document-sourced entry with refId", async () => {
      const doc = makeHealthDoc({
        weight: {
          values: [{ date: "2024-01-01", value: 70, source: "document", refId: "doc-1" }],
        },
      });
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await updateSignalEntry("p1", "weight", 0, { value: 80 });
      expect(result.success).toBe(false);
      expect(result.error).toContain("document-sourced");
    });

    it("allows update for manual entry (source=input)", async () => {
      const doc = makeHealthDoc({
        weight: {
          values: [{ date: "2024-01-01", value: 70, source: "input", signal: "weight" }],
        },
      });
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await updateSignalEntry("p1", "weight", 0, { value: 80 });
      expect(result.success).toBe(true);
      expect(doc.content.signals["weight"].values[0].value).toBe(80);
    });

    it("preserves signal name on updated entry", async () => {
      const doc = makeHealthDoc({
        weight: {
          values: [{ date: "2024-01-01", value: 70, source: "input", signal: "weight" }],
        },
      });
      mockGetHealthDocument.mockResolvedValue(doc);

      await updateSignalEntry("p1", "weight", 0, { value: 80 });
      expect(doc.content.signals["weight"].values[0].signal).toBe("weight");
    });

    it("allows update for document entry without refId", async () => {
      const doc = makeHealthDoc({
        weight: {
          values: [{ date: "2024-01-01", value: 70, source: "document" }],
        },
      });
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await updateSignalEntry("p1", "weight", 0, { value: 80 });
      expect(result.success).toBe(true);
    });

    it("returns error on exception", async () => {
      mockGetHealthDocument.mockRejectedValue(new Error("Network error"));

      const result = await updateSignalEntry("p1", "weight", 0, {});
      expect(result.success).toBe(false);
    });
  });

  // ── deleteSignalEntry ─────────────────────────────────────────────────────

  describe("deleteSignalEntry", () => {
    it("returns error when health document not found", async () => {
      mockGetHealthDocument.mockResolvedValue(null);

      const result = await deleteSignalEntry("p1", "weight", 0);
      expect(result.success).toBe(false);
    });

    it("returns error when signal entry not found", async () => {
      const doc = makeHealthDoc({ weight: { values: [] } });
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await deleteSignalEntry("p1", "weight", 0);
      expect(result.success).toBe(false);
    });

    it("returns error for document-sourced entry with refId", async () => {
      const doc = makeHealthDoc({
        weight: {
          values: [{ source: "document", refId: "doc-1" }],
        },
      });
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await deleteSignalEntry("p1", "weight", 0);
      expect(result.success).toBe(false);
      expect(result.error).toContain("document-sourced");
    });

    it("deletes manual entry at given index", async () => {
      const doc = makeHealthDoc({
        weight: {
          values: [
            { date: "2024-01-01", value: 70, source: "input" },
            { date: "2024-02-01", value: 72, source: "input" },
          ],
        },
      });
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await deleteSignalEntry("p1", "weight", 0);
      expect(result.success).toBe(true);
      expect(doc.content.signals["weight"].values).toHaveLength(1);
    });

    it("updates profile store after deletion", async () => {
      const doc = makeHealthDoc({
        weight: { values: [{ date: "2024-01-01", value: 70, source: "input" }] },
      });
      mockGetHealthDocument.mockResolvedValue(doc);
      const profile = { id: "p1", health: {} };
      mockProfilesGet.mockResolvedValue(profile);

      await deleteSignalEntry("p1", "weight", 0);
      expect(mockUpdateProfile).toHaveBeenCalledWith(profile);
    });

    it("returns error on exception", async () => {
      mockGetHealthDocument.mockRejectedValue(new Error("DB error"));

      const result = await deleteSignalEntry("p1", "weight", 0);
      expect(result.success).toBe(false);
    });
  });

  // ── addSignalEntriesBatch ─────────────────────────────────────────────────

  describe("addSignalEntriesBatch", () => {
    it("returns error when health document not found", async () => {
      mockGetHealthDocument.mockResolvedValue(null);

      const result = await addSignalEntriesBatch("p1", [
        { signal: "weight", entry: makeSignalEntry() },
      ]);
      expect(result.success).toBe(false);
    });

    it("inserts multiple entries in one operation", async () => {
      const doc = makeHealthDoc();
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await addSignalEntriesBatch("p1", [
        { signal: "weight", entry: makeSignalEntry({ date: "2024-01-01", value: 70 }) },
        { signal: "height", entry: makeSignalEntry({ date: "2024-01-01", value: 180 }) },
      ]);

      expect(result.success).toBe(true);
      expect(result.entriesInserted).toBe(2);
      expect(mockUpdateDocument).toHaveBeenCalledOnce();
    });

    it("deduplicates entries with same date and source", async () => {
      const doc = makeHealthDoc({
        weight: {
          values: [{ date: "2024-01-01", value: 70, source: "input", signal: "weight" }],
        },
      });
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await addSignalEntriesBatch("p1", [
        { signal: "weight", entry: makeSignalEntry({ date: "2024-01-01", value: 70 }) },
        { signal: "weight", entry: makeSignalEntry({ date: "2024-02-01", value: 72 }) },
      ]);

      expect(result.entriesInserted).toBe(1);
    });

    it("initializes signal structure for new signals", async () => {
      const doc = makeHealthDoc();
      mockGetHealthDocument.mockResolvedValue(doc);

      await addSignalEntriesBatch("p1", [
        { signal: "blood_pressure", entry: makeSignalEntry() },
      ]);

      expect(doc.content.signals["blood_pressure"]).toBeDefined();
    });

    it("sorts inserted values by date descending", async () => {
      const doc = makeHealthDoc();
      mockGetHealthDocument.mockResolvedValue(doc);

      await addSignalEntriesBatch("p1", [
        { signal: "weight", entry: makeSignalEntry({ date: "2023-01-01", value: 68 }) },
        { signal: "weight", entry: makeSignalEntry({ date: "2024-01-01", value: 75 }) },
      ]);

      const values = doc.content.signals["weight"].values;
      expect(new Date(values[0].date).getFullYear()).toBe(2024);
    });

    it("returns success with entriesInserted count", async () => {
      const doc = makeHealthDoc();
      mockGetHealthDocument.mockResolvedValue(doc);

      const result = await addSignalEntriesBatch("p1", [
        { signal: "weight", entry: makeSignalEntry({ date: "2024-01-01" }) },
        { signal: "weight", entry: makeSignalEntry({ date: "2024-02-01" }) },
        { signal: "height", entry: makeSignalEntry({ date: "2024-01-01" }) },
      ]);

      expect(result.entriesInserted).toBe(3);
    });

    it("returns error on exception", async () => {
      mockGetHealthDocument.mockRejectedValue(new Error("Network error"));

      const result = await addSignalEntriesBatch("p1", [
        { signal: "weight", entry: makeSignalEntry() },
      ]);
      expect(result.success).toBe(false);
    });
  });

  // ── getSignalValues ───────────────────────────────────────────────────────

  describe("getSignalValues", () => {
    it("returns empty array when document not found", async () => {
      mockGetHealthDocument.mockResolvedValue(null);

      const values = await getSignalValues("p1", "weight");
      expect(values).toEqual([]);
    });

    it("returns values for existing signal", async () => {
      const entries = [
        { date: "2024-01-01", value: 70, signal: "weight", source: "input" },
      ];
      const doc = makeHealthDoc({ weight: { values: entries } });
      mockGetHealthDocument.mockResolvedValue(doc);

      const values = await getSignalValues("p1", "weight");
      expect(values).toEqual(entries);
    });

    it("returns empty array for signal with no values", async () => {
      const doc = makeHealthDoc({ weight: { values: [] } });
      mockGetHealthDocument.mockResolvedValue(doc);

      const values = await getSignalValues("p1", "weight");
      expect(values).toEqual([]);
    });

    it("returns empty array for unknown signal", async () => {
      const doc = makeHealthDoc({});
      mockGetHealthDocument.mockResolvedValue(doc);

      const values = await getSignalValues("p1", "nonexistent");
      expect(values).toEqual([]);
    });

    it("returns empty array on exception", async () => {
      mockGetHealthDocument.mockRejectedValue(new Error("DB error"));

      const values = await getSignalValues("p1", "weight");
      expect(values).toEqual([]);
    });
  });
});
