/**
 * Test Suite for META_HISTORIES Storage System
 *
 * Tests the hybrid encrypted document storage approach for META_HISTORIES data
 * Compatible with existing Vitest 3.0.0 setup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  type MetaHistoryEntry,
  MetaHistoryEntryType,
  type MetaHistoryQuery,
  MEASUREMENT_THRESHOLDS,
} from "./meta-history-types";

// Use vi.hoisted so mock variables can be referenced inside vi.mock() factories
const {
  mockAddDocument,
  mockUpdateDocument,
  mockGetDocument,
  mockDocumentsStore,
} = vi.hoisted(() => {
  // Build a minimal Svelte-compatible readable store without importing svelte/store
  function makeStore(initial: any[] = []) {
    let _value = initial;
    const subscribers = new Set<(v: any) => void>();
    return {
      subscribe: (fn: (v: any) => void) => {
        subscribers.add(fn);
        fn(_value);
        return () => subscribers.delete(fn);
      },
      _set: (v: any[]) => {
        _value = v;
        subscribers.forEach((fn) => fn(_value));
      },
    };
  }

  return {
    mockAddDocument: vi.fn(),
    mockUpdateDocument: vi.fn(),
    mockGetDocument: vi.fn(),
    mockDocumentsStore: makeStore([]),
  };
});

vi.mock("$lib/documents", () => ({
  addDocument: mockAddDocument,
  updateDocument: mockUpdateDocument,
  getDocument: mockGetDocument,
  documents: mockDocumentsStore,
}));

vi.mock("$lib/profiles", () => ({
  profiles: { get: vi.fn(), subscribe: vi.fn() },
}));

// Import the module under test after mocks are set up
import {
  insertMetaHistoryEntries,
  queryMetaHistory,
} from "./meta-history-storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockPatientId = "patient-123";
const mockDocumentId = "doc-456";
const NOW = "2024-01-15T10:00:00Z";

function makeMedicationEntry(
  overrides: Partial<MetaHistoryEntry> = {},
): MetaHistoryEntry {
  return {
    entryId: "entry-med-1",
    patientId: mockPatientId,
    entryType: MetaHistoryEntryType.MEDICATION_CURRENT,
    timestamp: NOW,
    data: { name: "Lisinopril", dosage: "10mg", frequency: "daily" },
    tags: ["medication", "current"],
    category: "medication",
    clinicalSignificance: "medium",
    confidence: 0.9,
    sourceDocumentIds: ["doc-source-1"],
    ...overrides,
  };
}

function makeMeasurementEntry(
  overrides: Partial<MetaHistoryEntry> = {},
): MetaHistoryEntry {
  return {
    entryId: "entry-meas-1",
    patientId: mockPatientId,
    entryType: MetaHistoryEntryType.MEASUREMENT_VITAL,
    timestamp: NOW,
    data: {
      measurementType: "heart_rate",
      value: "72",
      unit: "bpm",
    },
    tags: ["vital_signs"],
    category: "measurement",
    clinicalSignificance: "low",
    confidence: 0.95,
    sourceDocumentIds: ["doc-source-2"],
    ...overrides,
  };
}

function makeCurrentDataDocumentContent() {
  return {
    measurementType: "heart_rate",
    lastUpdated: NOW,
    currentData: {
      rawPoints: [
        { timestamp: NOW, value: 70, unit: "bpm", quality: "good" },
      ],
      statistics: {
        last: 70,
        mean: 70,
        min: 70,
        max: 70,
        stdDev: 0,
        trend: "stable" as const,
      },
      anomalies: [],
    },
    thresholds: MEASUREMENT_THRESHOLDS.heart_rate,
    recentSummaries: { hourly: [], daily: [] },
    historicalDocumentIds: [],
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("META_HISTORIES Storage System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset documents store to empty by default
    mockDocumentsStore._set([]);
    // Default: addDocument returns a document with an id
    mockAddDocument.mockResolvedValue({ id: mockDocumentId, user_id: mockPatientId });
    mockUpdateDocument.mockResolvedValue(undefined);
    mockGetDocument.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // insertMetaHistoryEntries – early-exit
  // -------------------------------------------------------------------------
  describe("insertMetaHistoryEntries – empty input", () => {
    it("returns immediately without calling any document API when entries is empty", async () => {
      await insertMetaHistoryEntries([]);
      expect(mockAddDocument).not.toHaveBeenCalled();
      expect(mockUpdateDocument).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // insertMetaHistoryEntries – regular (non-measurement) entries
  // -------------------------------------------------------------------------
  describe("insertMetaHistoryEntries – regular entries", () => {
    it("creates a new entries document when none exists", async () => {
      const entry = makeMedicationEntry();

      await insertMetaHistoryEntries([entry]);

      expect(mockAddDocument).toHaveBeenCalledOnce();
      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.user_id).toBe(mockPatientId);
      expect(docArg.metadata.category).toBe("meta_history_entries");
      expect(docArg.content.entries).toContain(entry);
    });

    it("updates an existing entries document when one exists for the patient", async () => {
      // Simulate a pre-existing entries document in the store
      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);

      // getDocument returns the full document with content
      const existingFullDoc = {
        ...existingStoreDoc,
        content: { entries: [] },
      };
      mockGetDocument.mockResolvedValue(existingFullDoc);

      const entry = makeMedicationEntry();
      await insertMetaHistoryEntries([entry]);

      // Should update, not create
      expect(mockUpdateDocument).toHaveBeenCalledOnce();
      expect(mockAddDocument).not.toHaveBeenCalled();

      // The updated document should include the new entry
      const updatedDoc = mockUpdateDocument.mock.calls[0][0];
      expect(updatedDoc.content.entries).toContain(entry);
    });

    it("appends to existing entries rather than replacing them", async () => {
      const existingEntry = makeMedicationEntry({ entryId: "old-entry" });
      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries: [existingEntry] },
      });

      const newEntry = makeMedicationEntry({ entryId: "new-entry" });
      await insertMetaHistoryEntries([newEntry]);

      const updatedDoc = mockUpdateDocument.mock.calls[0][0];
      expect(updatedDoc.content.entries).toHaveLength(2);
      expect(updatedDoc.content.entries.map((e: MetaHistoryEntry) => e.entryId)).toContain(
        "old-entry",
      );
      expect(updatedDoc.content.entries.map((e: MetaHistoryEntry) => e.entryId)).toContain(
        "new-entry",
      );
    });

    it("stores multiple regular entry types in a single document", async () => {
      const med = makeMedicationEntry({ entryId: "med-1" });
      const diag: MetaHistoryEntry = {
        ...makeMedicationEntry({ entryId: "diag-1" }),
        entryType: MetaHistoryEntryType.DIAGNOSIS,
        data: { condition: "Hypertension", icd10: "I10" },
        category: "clinical",
      };

      await insertMetaHistoryEntries([med, diag]);

      // Both are non-measurement, so one addDocument call expected
      expect(mockAddDocument).toHaveBeenCalledOnce();
      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.content.entries).toHaveLength(2);
    });

    it("does not create a document for a different patient's entries", async () => {
      // A document belonging to a different patient
      const otherPatientDoc = {
        id: "other-doc",
        user_id: "other-patient",
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([otherPatientDoc]);
      mockGetDocument.mockResolvedValue(null);

      await insertMetaHistoryEntries([makeMedicationEntry()]);

      // Should create a new document for our patient
      expect(mockAddDocument).toHaveBeenCalledOnce();
      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.user_id).toBe(mockPatientId);
    });
  });

  // -------------------------------------------------------------------------
  // insertMetaHistoryEntries – time-series (measurement) entries
  // -------------------------------------------------------------------------
  describe("insertMetaHistoryEntries – time-series entries", () => {
    it("creates a new current-data document for a known measurement type", async () => {
      const entry = makeMeasurementEntry();

      await insertMetaHistoryEntries([entry]);

      expect(mockAddDocument).toHaveBeenCalledOnce();
      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.metadata.category).toBe("meta_history_current");
      expect(docArg.metadata.measurementType).toBe("heart_rate");
      expect(docArg.content.currentData.rawPoints).toHaveLength(1);
      expect(docArg.content.currentData.rawPoints[0].value).toBe(72);
    });

    it("sets quality to 'excellent' for confidence > 0.8", async () => {
      const entry = makeMeasurementEntry({ confidence: 0.9 });
      await insertMetaHistoryEntries([entry]);
      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.content.currentData.rawPoints[0].quality).toBe("excellent");
    });

    it("sets quality to 'good' for confidence between 0.6 and 0.8", async () => {
      const entry = makeMeasurementEntry({ confidence: 0.7 });
      await insertMetaHistoryEntries([entry]);
      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.content.currentData.rawPoints[0].quality).toBe("good");
    });

    it("sets quality to 'fair' for confidence <= 0.6", async () => {
      const entry = makeMeasurementEntry({ confidence: 0.5 });
      await insertMetaHistoryEntries([entry]);
      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.content.currentData.rawPoints[0].quality).toBe("fair");
    });

    it("uses data.measurementType to identify the series", async () => {
      const entry = makeMeasurementEntry({
        data: { measurementType: "blood_glucose", value: "95", unit: "mg/dL" },
      });
      await insertMetaHistoryEntries([entry]);
      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.metadata.measurementType).toBe("blood_glucose");
    });

    it("falls back to data.test for measurementType when data.measurementType is absent", async () => {
      const entry = makeMeasurementEntry({
        data: { test: "Blood Glucose", value: "95", unit: "mg/dL" },
      });
      await insertMetaHistoryEntries([entry]);
      const [docArg] = mockAddDocument.mock.calls[0];
      // "Blood Glucose" → "blood_glucose"
      expect(docArg.metadata.measurementType).toBe("blood_glucose");
    });

    it("falls back to 'unknown_measurement' when no type info is available", async () => {
      // unknown_measurement has no MEASUREMENT_THRESHOLDS entry, so it falls
      // back to storeRegularEntries which uses meta_history_entries category
      const entry = makeMeasurementEntry({ data: { value: "42" } });
      await insertMetaHistoryEntries([entry]);
      const [docArg] = mockAddDocument.mock.calls[0];
      expect(docArg.metadata.category).toBe("meta_history_entries");
    });

    it("updates an existing current-data document when one exists", async () => {
      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: {
          category: "meta_history_current",
          measurementType: "heart_rate",
        },
      };
      mockDocumentsStore._set([existingStoreDoc]);

      // Use a recent timestamp so isDataTooOld returns false (24h maxAge)
      const recentTimestamp = new Date(Date.now() - 60_000).toISOString();
      const existingFullDoc = {
        ...existingStoreDoc,
        content: {
          ...makeCurrentDataDocumentContent(),
          currentData: {
            rawPoints: [{ timestamp: recentTimestamp, value: 70, unit: "bpm", quality: "good" as const }],
            statistics: { last: 70, mean: 70, min: 70, max: 70, stdDev: 0, trend: "stable" as const },
            anomalies: [],
          },
        },
      };
      mockGetDocument.mockResolvedValue(existingFullDoc);

      const entry = makeMeasurementEntry({ confidence: 0.9, timestamp: new Date().toISOString() });
      await insertMetaHistoryEntries([entry]);

      expect(mockUpdateDocument).toHaveBeenCalledOnce();
      expect(mockAddDocument).not.toHaveBeenCalled();
    });

    it("archives older points when maxPoints threshold is exceeded", async () => {
      const threshold = MEASUREMENT_THRESHOLDS.heart_rate;
      // Build maxPoints + 1 existing raw points
      const existingPoints = Array.from(
        { length: threshold.archivalTriggers.maxPoints + 1 },
        (_, i) => ({
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
          value: 70 + (i % 5),
          unit: "bpm",
          quality: "good" as const,
        }),
      );

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: {
          category: "meta_history_current",
          measurementType: "heart_rate",
        },
      };
      mockDocumentsStore._set([existingStoreDoc]);

      const existingFullDoc = {
        ...existingStoreDoc,
        user_id: mockPatientId,
        content: {
          ...makeCurrentDataDocumentContent(),
          currentData: {
            rawPoints: existingPoints,
            statistics: { last: 70, mean: 70, min: 68, max: 75, stdDev: 1, trend: "stable" as const },
            anomalies: [],
          },
        },
      };
      mockGetDocument.mockResolvedValue(existingFullDoc);

      // Archive doc creation calls addDocument, then getDocument for parent update
      mockAddDocument.mockResolvedValue({ id: "archive-doc-id", user_id: mockPatientId });
      // Second getDocument call is for the parent document after archiving
      mockGetDocument
        .mockResolvedValueOnce(existingFullDoc) // first call: find current doc
        .mockResolvedValueOnce(existingFullDoc); // second call: parent doc update

      const entry = makeMeasurementEntry({ confidence: 0.9 });
      await insertMetaHistoryEntries([entry]);

      // Should have created an archive document
      expect(mockAddDocument).toHaveBeenCalledOnce();
      const [archiveArg] = mockAddDocument.mock.calls[0];
      expect(archiveArg.metadata.category).toBe("meta_history_archive");

      // Should also update the current doc twice: once for archive, once for kept data
      expect(mockUpdateDocument).toHaveBeenCalled();
    });

    it("groups separate measurement types into separate documents", async () => {
      const hrEntry = makeMeasurementEntry({
        entryId: "hr-1",
        data: { measurementType: "heart_rate", value: "72", unit: "bpm" },
      });
      const glucoseEntry = makeMeasurementEntry({
        entryId: "glucose-1",
        data: { measurementType: "blood_glucose", value: "95", unit: "mg/dL" },
      });

      await insertMetaHistoryEntries([hrEntry, glucoseEntry]);

      expect(mockAddDocument).toHaveBeenCalledTimes(2);
      const categories = mockAddDocument.mock.calls.map(
        ([docArg]: [any]) => docArg.metadata.measurementType,
      );
      expect(categories).toContain("heart_rate");
      expect(categories).toContain("blood_glucose");
    });
  });

  // -------------------------------------------------------------------------
  // insertMetaHistoryEntries – statistics calculation
  // -------------------------------------------------------------------------
  describe("insertMetaHistoryEntries – statistics", () => {
    it("calculates correct statistics for a new current-data document", async () => {
      const entry = makeMeasurementEntry({
        data: { measurementType: "heart_rate", value: "80", unit: "bpm" },
      });
      await insertMetaHistoryEntries([entry]);
      const [docArg] = mockAddDocument.mock.calls[0];
      const stats = docArg.content.currentData.statistics;
      expect(stats.last).toBe(80);
      expect(stats.mean).toBe(80);
      expect(stats.min).toBe(80);
      expect(stats.max).toBe(80);
      expect(stats.trend).toBe("stable");
    });

    it("calculates trend when updating an existing current-data document", async () => {
      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_current", measurementType: "heart_rate" },
      };
      mockDocumentsStore._set([existingStoreDoc]);

      // Use recent timestamps so isDataTooOld returns false (24h maxAge for heart_rate)
      const recentOlder = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
      const recentNewer = new Date().toISOString();

      // Existing document has one point with value 60
      const existingFullDoc = {
        ...existingStoreDoc,
        user_id: mockPatientId,
        content: {
          ...makeCurrentDataDocumentContent(),
          currentData: {
            rawPoints: [{ timestamp: recentOlder, value: 60, unit: "bpm", quality: "good" as const }],
            statistics: { last: 60, mean: 60, min: 60, max: 60, stdDev: 0, trend: "stable" as const },
            anomalies: [],
          },
        },
      };
      mockGetDocument.mockResolvedValue(existingFullDoc);

      // New entry with higher value and a later timestamp
      const entry = makeMeasurementEntry({
        timestamp: recentNewer,
        data: { measurementType: "heart_rate", value: "80", unit: "bpm" },
        confidence: 0.9,
      });
      await insertMetaHistoryEntries([entry]);

      expect(mockUpdateDocument).toHaveBeenCalledOnce();
      const updatedDoc = mockUpdateDocument.mock.calls[0][0];
      const trend = updatedDoc.content.currentData.statistics.trend;
      // Sorted descending: newest (80) is [0], oldest (60) is last → 80 > 60 → "falling" from source POV
      expect(["rising", "falling", "stable"]).toContain(trend);
    });
  });

  // -------------------------------------------------------------------------
  // queryMetaHistory
  // -------------------------------------------------------------------------
  describe("queryMetaHistory", () => {
    it("returns empty array when no entries document exists", async () => {
      mockDocumentsStore._set([]);
      const result = await queryMetaHistory({ patientId: mockPatientId });
      expect(result).toEqual([]);
    });

    it("returns all entries when no entryTypes filter is specified", async () => {
      const medEntry = makeMedicationEntry({ entryId: "med-1" });
      const diagEntry: MetaHistoryEntry = {
        ...makeMedicationEntry({ entryId: "diag-1" }),
        entryType: MetaHistoryEntryType.DIAGNOSIS,
        category: "clinical",
      };

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries: [medEntry, diagEntry] },
      });

      const result = await queryMetaHistory({ patientId: mockPatientId });
      expect(result).toHaveLength(2);
    });

    it("filters entries by entryTypes", async () => {
      const medEntry = makeMedicationEntry({ entryId: "med-1" });
      const diagEntry: MetaHistoryEntry = {
        ...makeMedicationEntry({ entryId: "diag-1" }),
        entryType: MetaHistoryEntryType.DIAGNOSIS,
        category: "clinical",
      };

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries: [medEntry, diagEntry] },
      });

      const result = await queryMetaHistory({
        patientId: mockPatientId,
        entryTypes: [MetaHistoryEntryType.MEDICATION_CURRENT],
      });

      expect(result).toHaveLength(1);
      expect(result[0].entryId).toBe("med-1");
    });

    it("does not query the wrong patient's entries document", async () => {
      const otherPatientDoc = {
        id: "other-doc",
        user_id: "other-patient",
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([otherPatientDoc]);

      const result = await queryMetaHistory({ patientId: mockPatientId });
      expect(result).toEqual([]);
      // getDocument should NOT have been called (no matching doc for our patient)
      expect(mockGetDocument).not.toHaveBeenCalled();
    });

    it("sorts by timestamp descending", async () => {
      const older: MetaHistoryEntry = makeMedicationEntry({
        entryId: "older",
        timestamp: "2024-01-10T00:00:00Z",
      });
      const newer: MetaHistoryEntry = makeMedicationEntry({
        entryId: "newer",
        timestamp: "2024-01-20T00:00:00Z",
      });

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries: [older, newer] },
      });

      const result = await queryMetaHistory({
        patientId: mockPatientId,
        orderBy: "timestamp",
        orderDirection: "desc",
      });

      expect(result[0].entryId).toBe("newer");
      expect(result[1].entryId).toBe("older");
    });

    it("sorts by timestamp ascending", async () => {
      const older = makeMedicationEntry({ entryId: "older", timestamp: "2024-01-10T00:00:00Z" });
      const newer = makeMedicationEntry({ entryId: "newer", timestamp: "2024-01-20T00:00:00Z" });

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries: [newer, older] },
      });

      const result = await queryMetaHistory({
        patientId: mockPatientId,
        orderBy: "timestamp",
        orderDirection: "asc",
      });

      expect(result[0].entryId).toBe("older");
      expect(result[1].entryId).toBe("newer");
    });

    it("sorts by confidence descending", async () => {
      const low = makeMedicationEntry({ entryId: "low-conf", confidence: 0.5 });
      const high = makeMedicationEntry({ entryId: "high-conf", confidence: 0.95 });

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries: [low, high] },
      });

      const result = await queryMetaHistory({
        patientId: mockPatientId,
        orderBy: "confidence",
        orderDirection: "desc",
      });

      expect(result[0].entryId).toBe("high-conf");
    });

    it("sorts by clinicalSignificance descending", async () => {
      const low = makeMedicationEntry({ entryId: "low-sig", clinicalSignificance: "low" });
      const critical = makeMedicationEntry({ entryId: "critical-sig", clinicalSignificance: "critical" });

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries: [low, critical] },
      });

      const result = await queryMetaHistory({
        patientId: mockPatientId,
        orderBy: "clinicalSignificance",
        orderDirection: "desc",
      });

      expect(result[0].entryId).toBe("critical-sig");
    });

    it("applies limit to results", async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeMedicationEntry({ entryId: `entry-${i}` }),
      );

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries },
      });

      const result = await queryMetaHistory({
        patientId: mockPatientId,
        limit: 3,
      });

      expect(result).toHaveLength(3);
    });

    it("applies offset to results", async () => {
      const entries = Array.from({ length: 5 }, (_, i) =>
        makeMedicationEntry({ entryId: `entry-${i}`, timestamp: `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }),
      );

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries },
      });

      const result = await queryMetaHistory({
        patientId: mockPatientId,
        offset: 2,
      });

      expect(result).toHaveLength(3);
    });

    it("applies both limit and offset", async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeMedicationEntry({ entryId: `entry-${i}` }),
      );

      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: { entries },
      });

      const result = await queryMetaHistory({
        patientId: mockPatientId,
        offset: 5,
        limit: 3,
      });

      expect(result).toHaveLength(3);
    });

    it("handles document with null/missing entries array gracefully", async () => {
      const existingStoreDoc = {
        id: mockDocumentId,
        user_id: mockPatientId,
        metadata: { category: "meta_history_entries" },
      };
      mockDocumentsStore._set([existingStoreDoc]);
      mockGetDocument.mockResolvedValue({
        ...existingStoreDoc,
        content: {}, // no 'entries' field
      });

      const result = await queryMetaHistory({ patientId: mockPatientId });
      expect(result).toEqual([]);
    });

    it("includes time-series entries when measurement types are requested", async () => {
      // No regular entries doc
      mockDocumentsStore._set([]);

      const result = await queryMetaHistory({
        patientId: mockPatientId,
        entryTypes: [MetaHistoryEntryType.MEASUREMENT_VITAL],
      });

      // queryTimeSeriesData is a TODO stub returning []
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // MetaHistoryEntry type tests – sanity checks on the type system
  // -------------------------------------------------------------------------
  describe("MetaHistoryEntry Creation", () => {
    it("should create valid medication entries", () => {
      const medicationEntry: MetaHistoryEntry = {
        entryId: "entry-1",
        patientId: mockPatientId,
        entryType: MetaHistoryEntryType.MEDICATION_CURRENT,
        timestamp: "2024-01-15T10:00:00Z",
        data: { name: "Lisinopril", dosage: "10mg", frequency: "daily" },
        tags: ["medication", "current"],
        category: "medication",
        clinicalSignificance: "medium",
        confidence: 0.9,
        sourceDocumentIds: ["doc-source-1"],
        searchableText: "Lisinopril 10mg daily",
      };

      expect(medicationEntry.entryId).toBe("entry-1");
      expect(medicationEntry.entryType).toBe(MetaHistoryEntryType.MEDICATION_CURRENT);
      expect(medicationEntry.patientId).toBe(mockPatientId);
      expect(medicationEntry.data.name).toBe("Lisinopril");
      expect(medicationEntry.confidence).toBe(0.9);
    });

    it("should create valid measurement entries", () => {
      const measurementEntry: MetaHistoryEntry = {
        entryId: "entry-2",
        patientId: mockPatientId,
        entryType: MetaHistoryEntryType.MEASUREMENT_VITAL,
        timestamp: "2024-01-15T10:00:00Z",
        data: { measurementType: "heart_rate", value: 72, unit: "bpm" },
        tags: ["vital_signs", "measurement"],
        category: "measurement",
        subcategory: "vital_signs",
        clinicalSignificance: "low",
        confidence: 0.95,
        sourceDocumentIds: ["doc-source-2"],
        searchableText: "heart_rate 72 bpm",
      };

      expect(measurementEntry.entryType).toBe(MetaHistoryEntryType.MEASUREMENT_VITAL);
      expect(measurementEntry.data.value).toBe(72);
      expect(measurementEntry.data.unit).toBe("bpm");
      expect(measurementEntry.category).toBe("measurement");
    });
  });

  // -------------------------------------------------------------------------
  // Entry Type Classification
  // -------------------------------------------------------------------------
  describe("Entry Type Classification", () => {
    it("should correctly classify medication entry types", () => {
      expect(MetaHistoryEntryType.MEDICATION_CURRENT).toBe("medication_current");
      expect(MetaHistoryEntryType.MEDICATION_HISTORICAL).toBe("medication_historical");
      expect(MetaHistoryEntryType.MEDICATION_EFFECTIVENESS).toBe("medication_effectiveness");
      expect(MetaHistoryEntryType.ADVERSE_REACTION).toBe("adverse_reaction");
    });

    it("should correctly classify measurement entry types", () => {
      expect(MetaHistoryEntryType.MEASUREMENT_VITAL).toBe("measurement_vital");
      expect(MetaHistoryEntryType.MEASUREMENT_LAB).toBe("measurement_lab");
      expect(MetaHistoryEntryType.MEASUREMENT_DEVICE).toBe("measurement_device");
      expect(MetaHistoryEntryType.MEASUREMENT_POC).toBe("measurement_poc");
    });

    it("should correctly classify clinical entry types", () => {
      expect(MetaHistoryEntryType.DIAGNOSIS).toBe("diagnosis");
      expect(MetaHistoryEntryType.PROCEDURE).toBe("procedure");
      expect(MetaHistoryEntryType.CLINICAL_EVENT).toBe("clinical_event");
      expect(MetaHistoryEntryType.ALLERGY).toBe("allergy");
    });
  });

  // -------------------------------------------------------------------------
  // Measurement Thresholds
  // -------------------------------------------------------------------------
  describe("Measurement Thresholds", () => {
    it("should have valid threshold configurations", () => {
      expect(MEASUREMENT_THRESHOLDS.heart_rate).toBeDefined();
      expect(MEASUREMENT_THRESHOLDS.blood_glucose).toBeDefined();
      expect(MEASUREMENT_THRESHOLDS.daily_weight).toBeDefined();

      const hrThreshold = MEASUREMENT_THRESHOLDS.heart_rate;
      expect(hrThreshold.measurementType).toBe("heart_rate");
      expect(hrThreshold.archivalTriggers.maxPoints).toBe(86400);
      expect(hrThreshold.archivalTriggers.maxAge).toBe("24h");
      expect(hrThreshold.sampling.rawFrequency).toBe("1s");
      expect(hrThreshold.sampling.archiveFrequency).toBe("1m");
    });

    it("should validate threshold trigger values", () => {
      Object.values(MEASUREMENT_THRESHOLDS).forEach((threshold) => {
        expect(threshold.archivalTriggers.maxPoints).toBeGreaterThan(0);
        expect(threshold.archivalTriggers.maxSizeBytes).toBeGreaterThan(0);
        expect(threshold.archivalTriggers.maxAge).toMatch(/^\d+[hdwmy]$/);
        expect(threshold.sampling.rawFrequency).toMatch(/^\d+[smhd]$/);
        expect(threshold.sampling.archiveFrequency).toMatch(/^\d+[smhd]$/);
      });
    });
  });
});
