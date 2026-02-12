// Signal Data Migration System - Automatic migration from legacy signal format
// Maintains backwards compatibility while adding enhanced signal capabilities

import type { Signal } from "$lib/types.d";
import type {
  EnhancedSignal,
  SignalContext,
  SignalValidation,
  SignalMetadata,
} from "$lib/langgraph/state";
import type { Document } from "$lib/documents/types.d";
import { updateDocument } from "$lib/documents";

export interface LegacySignalStorage {
  log: string;
  history: any[];
  values: Signal[];
}

export interface EnhancedSignalStorage {
  log: string;
  values: EnhancedSignal[];
  analytics?: TimeSeriesAnalytics;
  metadata: {
    lastUpdated: string;
    migrationSource?: string;
    signalDefinition?: SignalDefinition;
  };
}

export interface TimeSeriesAnalytics {
  trend: "increasing" | "decreasing" | "stable" | "fluctuating";
  slope: number;
  variance: number;
  lastValue: any;
  averageValue: any;
  minValue: any;
  maxValue: any;
  dataPoints: number;
}

export interface SignalDefinition {
  name: string;
  description: string;
  unit: string;
  normalRange: {
    min?: number;
    max?: number;
    reference: string;
  };
  category: string;
  synonyms: string[];
}

export interface MigrationMetadata {
  originalVersion: string;
  migratedSignalCount: number;
  preservedHistoryCount: number;
  migrationDate: string;
  migrationTime: number;
  warnings: string[];
}

export class SignalDataMigration {
  static readonly CURRENT_VERSION = "2.0";
  static readonly LEGACY_VERSION = "1.0";

  /**
   * Detects if document signals need migration
   */
  static needsMigration(document: Document): boolean {
    const signals = document.content?.signals;
    if (!signals || Object.keys(signals).length === 0) {
      return false;
    }

    // Check for version marker
    const version = document.content.signalsVersion;
    if (version === this.CURRENT_VERSION) {
      return false;
    }

    // Check for legacy format indicators
    for (const [signalName, signalData] of Object.entries(signals)) {
      if (this.isLegacyFormat(signalData)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if signal data is in legacy format
   */
  private static isLegacyFormat(signalData: any): boolean {
    // Legacy format has: { log: string, history: array, values: Signal[] }
    // Enhanced format has: { log: string, values: EnhancedSignal[], analytics?: ..., metadata: ... }

    if (!signalData || typeof signalData !== "object") {
      return false;
    }

    // If it has metadata field, it's already enhanced
    if (signalData.metadata) {
      return false;
    }

    // If it has history field and no metadata, it's legacy
    if (signalData.history !== undefined) {
      return true;
    }

    // Check if values array contains legacy signals (no context/validation fields)
    if (signalData.values && Array.isArray(signalData.values)) {
      const firstValue = signalData.values[0];
      if (firstValue && !firstValue.context && !firstValue.validation) {
        return true;
      }
    }

    return false;
  }

  /**
   * Migrates signals in-place during document access
   */
  static async migrateSignals(document: Document): Promise<Document> {
    if (!this.needsMigration(document)) {
      return document;
    }

    const startTime = Date.now();
    console.log(`🔄 Migrating signals for document ${document.id}`);

    const migratedSignals: Record<string, EnhancedSignalStorage> = {};
    const originalSignals = document.content.signals || {};
    const warnings: string[] = [];

    for (const [signalName, signalData] of Object.entries(originalSignals)) {
      try {
        migratedSignals[signalName] = await this.migrateSignalEntry(
          signalName,
          signalData,
          document,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to migrate signal ${signalName}:`, error);
        warnings.push(
          `Failed to migrate signal ${signalName}: ${errorMessage}`,
        );

        // Create a minimal enhanced version to preserve data
        migratedSignals[signalName] = this.createFallbackEnhancedSignal(
          signalData,
          signalName,
        );
      }
    }

    const migrationTime = Date.now() - startTime;

    // Update document with migrated data
    const migratedDocument = {
      ...document,
      content: {
        ...document.content,
        signals: migratedSignals,
        signalsVersion: this.CURRENT_VERSION,
        migrationDate: new Date().toISOString(),
        migrationMetadata: {
          originalVersion: this.LEGACY_VERSION,
          migratedSignalCount: Object.keys(migratedSignals).length,
          preservedHistoryCount: this.countHistoryEntries(originalSignals),
          migrationDate: new Date().toISOString(),
          migrationTime,
          warnings,
        } as MigrationMetadata,
      },
    };

    // Validate migrated data
    this.validateMigration(originalSignals, migratedSignals);

    console.log(`✅ Signal migration completed in ${migrationTime}ms`);
    console.log(
      `📊 Migrated ${Object.keys(migratedSignals).length} signal types`,
    );

    return migratedDocument;
  }

  /**
   * Migrates individual signal entry to enhanced format
   */
  private static async migrateSignalEntry(
    signalName: string,
    legacyData: LegacySignalStorage,
    document: Document,
  ): Promise<EnhancedSignalStorage> {
    const enhancedSignals: EnhancedSignal[] = [];
    const values = legacyData.values || [];

    // Migrate each value to enhanced format
    for (const value of values) {
      const enhanced = await this.createEnhancedSignal(value, document);
      enhancedSignals.push(enhanced);
    }

    // Sort by date (newest first) - maintain existing order
    enhancedSignals.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Create enhanced storage structure
    return {
      log: legacyData.log || "full",
      values: enhancedSignals,
      analytics: await this.calculateTimeSeriesAnalytics(enhancedSignals),
      metadata: {
        lastUpdated: new Date().toISOString(),
        migrationSource: "legacy_v1",
        signalDefinition: await this.resolveSignalDefinition(signalName),
      },
    };
  }

  /**
   * Creates enhanced signal from legacy signal
   */
  private static async createEnhancedSignal(
    legacySignal: Signal,
    document: Document,
  ): Promise<EnhancedSignal> {
    const context = this.inferSignalContext(legacySignal, document);

    return {
      // Preserve all original fields (backwards compatibility)
      ...legacySignal,

      // Add enhanced fields
      context,
      validation: {
        status: "unvalidated", // Will be validated in next processing
        confidence: 0.8, // Default confidence for migrated data
        validationSources: [],
        warnings: ["Migrated from legacy format - validation pending"],
      } as SignalValidation,
      relationships: [], // Will be calculated during next analysis
      metadata: {
        extractedBy: "migration",
        extractionConfidence: 0.8,
        alternativeInterpretations: [],
        clinicalNotes: `Migrated from legacy format on ${new Date().toISOString()}`,
        migrationSource: legacySignal,
      } as SignalMetadata,
    };
  }

  /**
   * Infers signal context from legacy data and document
   */
  private static inferSignalContext(
    signal: Signal,
    document: Document,
  ): SignalContext {
    return {
      documentType: document.metadata?.type || "unknown",
      specimen: this.inferSpecimen(signal),
      method: signal.source === "input" ? "manual" : "extracted",
      location: document.metadata?.facility || "unknown",
      clinicalContext: document.content?.diagnosis || [],
    };
  }

  /**
   * Infers specimen type from signal name and reference
   */
  private static inferSpecimen(signal: Signal): string {
    const signalName = signal.signal.toLowerCase();
    const reference = signal.reference?.toLowerCase() || "";

    // Common specimen inference rules
    if (
      signalName.includes("blood") ||
      signalName.includes("serum") ||
      signalName.includes("plasma")
    ) {
      return "blood";
    }
    if (signalName.includes("urine")) {
      return "urine";
    }
    if (signalName.includes("saliva")) {
      return "saliva";
    }
    if (reference.includes("blood")) {
      return "blood";
    }
    if (reference.includes("urine")) {
      return "urine";
    }

    return "unknown";
  }

  /**
   * Calculates time series analytics for signal values
   */
  private static async calculateTimeSeriesAnalytics(
    signals: EnhancedSignal[],
  ): Promise<TimeSeriesAnalytics> {
    if (signals.length === 0) {
      return {
        trend: "stable",
        slope: 0,
        variance: 0,
        lastValue: null,
        averageValue: null,
        minValue: null,
        maxValue: null,
        dataPoints: 0,
      };
    }

    // Sort by date for trend analysis
    const sortedSignals = [...signals].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const numericValues = sortedSignals
      .map((s) => parseFloat(s.value))
      .filter((v) => !isNaN(v));

    if (numericValues.length === 0) {
      return {
        trend: "stable",
        slope: 0,
        variance: 0,
        lastValue: signals[0].value,
        averageValue: null,
        minValue: null,
        maxValue: null,
        dataPoints: signals.length,
      };
    }

    const lastValue = numericValues[numericValues.length - 1];
    const averageValue =
      numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    const minValue = Math.min(...numericValues);
    const maxValue = Math.max(...numericValues);

    // Calculate variance
    const variance =
      numericValues.reduce(
        (acc, val) => acc + Math.pow(val - averageValue, 2),
        0,
      ) / numericValues.length;

    // Calculate trend (simple linear regression slope)
    let slope = 0;
    let trend: "increasing" | "decreasing" | "stable" | "fluctuating" =
      "stable";

    if (numericValues.length > 1) {
      const n = numericValues.length;
      const sumX = (n * (n - 1)) / 2; // Sum of indices 0, 1, 2, ...
      const sumY = numericValues.reduce((a, b) => a + b, 0);
      const sumXY = numericValues.reduce((acc, val, idx) => acc + idx * val, 0);
      const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares of indices

      slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

      if (Math.abs(slope) < 0.1) {
        trend = "stable";
      } else if (slope > 0.1) {
        trend = "increasing";
      } else {
        trend = "decreasing";
      }

      // Check for high fluctuation
      if (variance > averageValue * 0.3) {
        trend = "fluctuating";
      }
    }

    return {
      trend,
      slope,
      variance,
      lastValue,
      averageValue,
      minValue,
      maxValue,
      dataPoints: signals.length,
    };
  }

  /**
   * Resolves signal definition from static catalog
   */
  private static async resolveSignalDefinition(
    signalName: string,
  ): Promise<SignalDefinition | undefined> {
    try {
      // Import the existing lab properties catalog
      const propertiesDefinition = await import(
        "$data/lab.properties.defaults.json"
      );

      const definition = propertiesDefinition.default[signalName.toLowerCase()];
      if (definition) {
        return {
          name: signalName,
          description: definition.description || signalName,
          unit: definition.unit || "",
          normalRange: {
            min: definition.min,
            max: definition.max,
            reference: definition.reference || "",
          },
          category: definition.category || "laboratory",
          synonyms: definition.synonyms || [],
        };
      }
    } catch (error) {
      console.warn(
        `Could not resolve signal definition for ${signalName}:`,
        error,
      );
    }

    return undefined;
  }

  /**
   * Creates fallback enhanced signal for failed migrations
   */
  private static createFallbackEnhancedSignal(
    legacyData: any,
    signalName: string,
  ): EnhancedSignalStorage {
    const values = legacyData.values || [];
    const enhancedValues: EnhancedSignal[] = values.map((value: Signal) => ({
      ...value,
      context: {
        documentType: "unknown",
        method: "extracted",
        location: "unknown",
        clinicalContext: [],
      },
      validation: {
        status: "unvalidated",
        confidence: 0.5,
        validationSources: [],
        warnings: ["Migration failed - fallback created"],
      },
      relationships: [],
      metadata: {
        extractedBy: "migration_fallback",
        extractionConfidence: 0.5,
        alternativeInterpretations: [],
        clinicalNotes: "Created as fallback during failed migration",
      },
    }));

    return {
      log: legacyData.log || "full",
      values: enhancedValues,
      metadata: {
        lastUpdated: new Date().toISOString(),
        migrationSource: "legacy_v1_fallback",
      },
    };
  }

  /**
   * Validates migration to ensure no data loss
   */
  private static validateMigration(
    originalSignals: Record<string, any>,
    migratedSignals: Record<string, EnhancedSignalStorage>,
  ): void {
    const originalSignalCount = Object.keys(originalSignals).length;
    const migratedSignalCount = Object.keys(migratedSignals).length;

    if (originalSignalCount !== migratedSignalCount) {
      throw new Error(
        `Signal count mismatch: ${originalSignalCount} original vs ${migratedSignalCount} migrated`,
      );
    }

    for (const [signalName, originalData] of Object.entries(originalSignals)) {
      const migratedData = migratedSignals[signalName];
      if (!migratedData) {
        throw new Error(`Missing migrated signal: ${signalName}`);
      }

      const originalValueCount = originalData.values?.length || 0;
      const migratedValueCount = migratedData.values?.length || 0;

      if (originalValueCount !== migratedValueCount) {
        throw new Error(
          `Value count mismatch for ${signalName}: ${originalValueCount} original vs ${migratedValueCount} migrated`,
        );
      }
    }

    console.log("✅ Migration validation passed");
  }

  /**
   * Count total history entries in original signals
   */
  private static countHistoryEntries(
    originalSignals: Record<string, any>,
  ): number {
    let count = 0;
    for (const signalData of Object.values(originalSignals)) {
      count += signalData.values?.length || 0;
    }
    return count;
  }

  /**
   * Lazy migration trigger - called when documents are accessed
   */
  static async checkAndMigrate(document: Document): Promise<Document> {
    if (!this.needsMigration(document)) {
      return document;
    }

    // Perform migration
    const migratedDocument = await this.migrateSignals(document);

    // Save migrated document (triggers re-encryption)
    await updateDocument(migratedDocument);

    // Log migration
    console.log(`✅ Successfully migrated signals for document ${document.id}`);

    return migratedDocument;
  }
}
