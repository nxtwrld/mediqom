/**
 * META_HISTORIES Hybrid Storage System
 *
 * Uses existing encrypted document storage for all META_HISTORIES data:
 * - Regular entries stored as 'meta_history_entries' documents
 * - Time-series current data as 'meta_history_current' documents
 * - Time-series archives as 'meta_history_archive' documents
 * - All data encrypted with AES and shareable via existing document system
 */

import { addDocument, updateDocument, getDocument } from "$lib/documents";
import { profiles } from "$lib/profiles";
import {
  DocumentType,
  type DocumentNew,
  type Document,
} from "$lib/documents/types.d";
import {
  type MetaHistoryEntry,
  type MetaHistoryDocument,
  type CurrentDataDocument,
  type HistoricalDataDocument,
  type TimeSeriesPoint,
  type MetaHistoryQuery,
  MEASUREMENT_THRESHOLDS,
} from "./meta-history-types";

// Custom document types for META_HISTORIES
const META_HISTORY_TYPES = {
  ENTRIES: "meta_history_entries" as DocumentType,
  CURRENT: "meta_history_current" as DocumentType,
  ARCHIVE: "meta_history_archive" as DocumentType,
} as const;

/**
 * Insert META_HISTORIES entries using encrypted document storage
 */
export async function insertMetaHistoryEntries(
  entries: MetaHistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  const patientId = entries[0].patientId;

  // Group entries by type for efficient storage
  const entriesByType = groupEntriesByStorageType(entries);

  // Handle regular entries (medications, diagnoses, etc.)
  if (entriesByType.regular.length > 0) {
    await storeRegularEntries(entriesByType.regular, patientId);
  }

  // Handle time-series entries (measurements)
  for (const [measurementType, timeSeriesEntries] of Object.entries(
    entriesByType.timeSeries,
  )) {
    await storeTimeSeriesEntries(timeSeriesEntries, patientId, measurementType);
  }
}

/**
 * Store regular META_HISTORIES entries as encrypted documents
 */
async function storeRegularEntries(
  entries: MetaHistoryEntry[],
  patientId: string,
): Promise<void> {
  // Try to find existing entries document for this patient
  const existingDoc = await findExistingEntriesDocument(patientId);

  if (existingDoc) {
    // Update existing document
    const currentEntries = existingDoc.content.entries || [];
    const updatedEntries = [...currentEntries, ...entries];

    existingDoc.content.entries = updatedEntries;
    existingDoc.content.lastUpdated = new Date().toISOString();

    await updateDocument(existingDoc);
  } else {
    // Create new entries document
    const metaHistoryDoc: MetaHistoryDocument = {
      documentType: "meta_history_current",
      patientId,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      entries,
    };

    const newDoc: DocumentNew = {
      user_id: patientId,
      type: META_HISTORY_TYPES.ENTRIES,
      metadata: {
        title: "META_HISTORIES Entries",
        category: "meta_history",
        tags: ["meta_history", "entries"],
        date: new Date().toISOString(),
      },
      content: {
        title: "META_HISTORIES Entries",
        tags: ["meta_history", "entries"],
        ...metaHistoryDoc,
      },
      attachments: [],
    };

    await addDocument(newDoc);
  }
}

/**
 * Store time-series entries with hybrid current/archive approach
 */
async function storeTimeSeriesEntries(
  entries: MetaHistoryEntry[],
  patientId: string,
  measurementType: string,
): Promise<void> {
  // Find or create current data document for this measurement type
  const currentDoc = await findCurrentDataDocument(patientId, measurementType);
  const threshold = MEASUREMENT_THRESHOLDS[measurementType];

  if (!threshold) {
    console.warn(
      `No threshold configuration found for ${measurementType}, treating as regular entry`,
    );
    await storeRegularEntries(entries, patientId);
    return;
  }

  // Convert entries to time series points
  const newPoints: TimeSeriesPoint[] = entries.map((entry) => ({
    timestamp: entry.timestamp,
    value: parseFloat(entry.data.value) || 0,
    unit: entry.data.unit,
    quality:
      entry.confidence > 0.8
        ? "excellent"
        : entry.confidence > 0.6
          ? "good"
          : "fair",
    context: {
      entryId: entry.entryId,
      sourceDocuments: entry.sourceDocumentIds,
      clinicalSignificance: entry.clinicalSignificance,
    },
  }));

  if (currentDoc) {
    // Update existing current document
    await updateCurrentDataDocument(currentDoc, newPoints, threshold);
  } else {
    // Create new current data document
    await createCurrentDataDocument(
      patientId,
      measurementType,
      newPoints,
      threshold,
    );
  }
}

/**
 * Update current data document and handle overflow to archives
 */
async function updateCurrentDataDocument(
  currentDoc: Document,
  newPoints: TimeSeriesPoint[],
  threshold: any,
): Promise<void> {
  const content = currentDoc.content as CurrentDataDocument;
  const updatedPoints = [...content.currentData.rawPoints, ...newPoints].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Check if we need to archive
  const shouldArchive =
    updatedPoints.length > threshold.archivalTriggers.maxPoints ||
    isDataTooOld(updatedPoints, threshold.archivalTriggers.maxAge);

  if (shouldArchive) {
    // Archive older data
    const cutoffIndex = Math.floor(threshold.archivalTriggers.maxPoints * 0.7); // Keep 70% of max
    const toArchive = updatedPoints.slice(cutoffIndex);
    const toKeep = updatedPoints.slice(0, cutoffIndex);

    // Create archive document
    await createArchiveDocument(
      currentDoc.user_id,
      content.measurementType,
      toArchive,
      threshold,
      currentDoc.id,
    );

    // Update current document with remaining data
    content.currentData.rawPoints = toKeep;
  } else {
    content.currentData.rawPoints = updatedPoints;
  }

  // Update statistics and summaries
  content.currentData.statistics = calculateStatistics(
    content.currentData.rawPoints,
  );
  content.lastUpdated = new Date().toISOString();

  await updateDocument(currentDoc);
}

/**
 * Create new current data document
 */
async function createCurrentDataDocument(
  patientId: string,
  measurementType: string,
  points: TimeSeriesPoint[],
  threshold: any,
): Promise<void> {
  const currentData: CurrentDataDocument = {
    measurementType,
    lastUpdated: new Date().toISOString(),
    currentData: {
      rawPoints: points,
      statistics: calculateStatistics(points),
      anomalies: [],
    },
    thresholds: threshold,
    recentSummaries: {
      hourly: [],
      daily: [],
    },
    historicalDocumentIds: [],
  };

  const newDoc: DocumentNew = {
    user_id: patientId,
    type: META_HISTORY_TYPES.CURRENT,
    metadata: {
      title: `${measurementType} Current Data`,
      category: "meta_history_timeseries",
      tags: ["meta_history", "timeseries", measurementType],
      date: new Date().toISOString(),
      measurementType,
    },
    content: {
      title: `${measurementType} Current Data`,
      tags: ["meta_history", "timeseries", measurementType],
      ...currentData,
    },
    attachments: [],
  };

  await addDocument(newDoc);
}

/**
 * Create archive document for older time-series data
 */
async function createArchiveDocument(
  patientId: string,
  measurementType: string,
  points: TimeSeriesPoint[],
  threshold: any,
  parentDocumentId: string,
): Promise<string> {
  const timeRange = {
    start: points[points.length - 1].timestamp,
    end: points[0].timestamp,
  };

  // Compress data according to threshold rules
  const compressedData = compressTimeSeriesData(points, threshold);

  const archiveData: HistoricalDataDocument = {
    measurementType,
    timeRange,
    archiveGeneration: 0,
    compressedData,
    preservedFeatures: {
      anomalies: [],
      patterns: [],
      clinicalEvents: [],
    },
    olderArchiveDocumentIds: [],
  };

  const archiveDoc: DocumentNew = {
    user_id: patientId,
    type: META_HISTORY_TYPES.ARCHIVE,
    metadata: {
      title: `${measurementType} Archive ${timeRange.start}`,
      category: "meta_history_archive",
      tags: ["meta_history", "archive", measurementType],
      date: timeRange.end,
      measurementType,
      timeRange,
      parentDocumentId,
    },
    content: {
      title: `${measurementType} Archive ${timeRange.start}`,
      tags: ["meta_history", "archive", measurementType],
      ...archiveData,
    },
    attachments: [],
  };

  const savedDoc = await addDocument(archiveDoc);

  // Update parent document's historical references
  const parentDoc = await getDocument(parentDocumentId);
  if (parentDoc) {
    const parentContent = parentDoc.content as CurrentDataDocument;
    parentContent.historicalDocumentIds.push(savedDoc.id);
    await updateDocument(parentDoc);
  }

  return savedDoc.id;
}

/**
 * Query META_HISTORIES entries from encrypted documents
 */
export async function queryMetaHistory(
  query: MetaHistoryQuery,
): Promise<MetaHistoryEntry[]> {
  const results: MetaHistoryEntry[] = [];

  // Query regular entries
  const entriesDoc = await findExistingEntriesDocument(query.patientId);
  if (entriesDoc) {
    const entries = entriesDoc.content.entries || [];
    const filtered = filterEntries(entries, query);
    results.push(...filtered);
  }

  // Query time-series data if measurement types are requested
  if (
    query.entryTypes?.some((type) =>
      ["measurement_vital", "measurement_lab", "measurement_device"].includes(
        type,
      ),
    )
  ) {
    const timeSeriesEntries = await queryTimeSeriesData(query);
    results.push(...timeSeriesEntries);
  }

  // Apply final sorting and pagination
  return applyFinalFiltering(results, query);
}

// Helper functions

function groupEntriesByStorageType(entries: MetaHistoryEntry[]) {
  const regular: MetaHistoryEntry[] = [];
  const timeSeries: { [measurementType: string]: MetaHistoryEntry[] } = {};

  entries.forEach((entry) => {
    if (entry.entryType.startsWith("measurement_")) {
      const measurementType = determineMeasurementType(entry);
      if (!timeSeries[measurementType]) {
        timeSeries[measurementType] = [];
      }
      timeSeries[measurementType].push(entry);
    } else {
      regular.push(entry);
    }
  });

  return { regular, timeSeries };
}

function determineMeasurementType(entry: MetaHistoryEntry): string {
  // Extract measurement type from entry data
  return (
    entry.data.measurementType ||
    entry.data.test?.toLowerCase().replace(/\s+/g, "_") ||
    "unknown_measurement"
  );
}

async function findExistingEntriesDocument(
  patientId: string,
): Promise<Document | null> {
  // TODO: Implement document querying by metadata
  // This would use your existing document search/query functionality
  // For now, return null to always create new documents
  return null;
}

async function findCurrentDataDocument(
  patientId: string,
  measurementType: string,
): Promise<Document | null> {
  // TODO: Implement document querying by metadata
  // Search for documents with type='meta_history_current' and metadata.measurementType=measurementType
  return null;
}

function isDataTooOld(points: TimeSeriesPoint[], maxAge: string): boolean {
  if (points.length === 0) return false;

  const oldestPoint = points[points.length - 1];
  const ageMs =
    new Date().getTime() - new Date(oldestPoint.timestamp).getTime();
  const maxAgeMs = parseTimeString(maxAge);

  return ageMs > maxAgeMs;
}

function parseTimeString(timeStr: string): number {
  // Convert "24h", "7d", "30d" to milliseconds
  const match = timeStr.match(/^(\d+)([hdwmy])$/);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers = {
    h: 60 * 60 * 1000, // hours
    d: 24 * 60 * 60 * 1000, // days
    w: 7 * 24 * 60 * 60 * 1000, // weeks
    m: 30 * 24 * 60 * 60 * 1000, // months (approximate)
    y: 365 * 24 * 60 * 60 * 1000, // years (approximate)
  };

  return value * (multipliers[unit as keyof typeof multipliers] || 0);
}

function calculateStatistics(points: TimeSeriesPoint[]) {
  if (points.length === 0) {
    return {
      last: 0,
      mean: 0,
      min: 0,
      max: 0,
      stdDev: 0,
      trend: "stable" as const,
    };
  }

  const values = points.map((p) => p.value);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  const variance =
    values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);

  // Simple trend calculation (compare first and last values)
  const trend: "rising" | "falling" | "stable" =
    points.length > 1
      ? points[0].value > points[points.length - 1].value
        ? "falling"
        : points[0].value < points[points.length - 1].value
          ? "rising"
          : "stable"
      : "stable";

  return {
    last: points[0].value,
    mean,
    min,
    max,
    stdDev,
    trend,
  };
}

function compressTimeSeriesData(points: TimeSeriesPoint[], threshold: any) {
  // TODO: Implement actual compression based on threshold.sampling rules
  // For now, return basic downsampled data
  return {
    hourly: [], // Would contain hourly summaries
    daily: [], // Would contain daily summaries
  };
}

function filterEntries(
  entries: MetaHistoryEntry[],
  query: MetaHistoryQuery,
): MetaHistoryEntry[] {
  // TODO: Implement comprehensive filtering based on query parameters
  return entries.filter((entry) => {
    if (query.entryTypes && !query.entryTypes.includes(entry.entryType)) {
      return false;
    }
    return true;
  });
}

async function queryTimeSeriesData(
  query: MetaHistoryQuery,
): Promise<MetaHistoryEntry[]> {
  // TODO: Implement time-series data querying from current/archive documents
  return [];
}

function applyFinalFiltering(
  entries: MetaHistoryEntry[],
  query: MetaHistoryQuery,
): MetaHistoryEntry[] {
  // Apply sorting and pagination
  let filtered = [...entries];

  // Sort
  if (query.orderBy) {
    filtered.sort((a, b) => {
      let aVal, bVal;
      switch (query.orderBy) {
        case "timestamp":
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        case "confidence":
          aVal = a.confidence;
          bVal = b.confidence;
          break;
        case "clinicalSignificance":
          const significance = { critical: 4, high: 3, medium: 2, low: 1 };
          aVal = significance[a.clinicalSignificance || "low"];
          bVal = significance[b.clinicalSignificance || "low"];
          break;
        default:
          return 0;
      }

      return query.orderDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }

  // Pagination
  if (query.offset) {
    filtered = filtered.slice(query.offset);
  }
  if (query.limit) {
    filtered = filtered.slice(0, query.limit);
  }

  return filtered;
}
