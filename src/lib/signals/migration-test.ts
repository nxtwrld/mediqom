// Signal Migration Testing System - Validates migration functionality
// Ensures data integrity and backwards compatibility

import { SignalDataMigration } from "./migration";
import type { Document } from "$lib/documents/types.d";
import type { Signal } from "$lib/types.d";

export interface MigrationTestResult {
  testName: string;
  passed: boolean;
  error?: string;
  details?: any;
}

export interface MigrationTestSuite {
  suiteName: string;
  tests: MigrationTestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  overallPassed: boolean;
}

export class SignalMigrationTester {
  /**
   * Run comprehensive migration test suite
   */
  static async runMigrationTests(): Promise<MigrationTestSuite> {
    const tests: MigrationTestResult[] = [];

    // Test 1: Basic migration functionality
    tests.push(await this.testBasicMigration());

    // Test 2: Data preservation
    tests.push(await this.testDataPreservation());

    // Test 3: Idempotent migration
    tests.push(await this.testIdempotentMigration());

    // Test 4: Edge cases and malformed data
    tests.push(await this.testEdgeCases());

    // Test 5: Performance test
    tests.push(await this.testMigrationPerformance());

    // Test 6: Backwards compatibility
    tests.push(await this.testBackwardsCompatibility());

    const passedTests = tests.filter((t) => t.passed).length;
    const failedTests = tests.filter((t) => !t.passed).length;

    return {
      suiteName: "Signal Migration Test Suite",
      tests,
      totalTests: tests.length,
      passedTests,
      failedTests,
      overallPassed: failedTests === 0,
    };
  }

  /**
   * Test basic migration functionality
   */
  private static async testBasicMigration(): Promise<MigrationTestResult> {
    try {
      const legacyDocument = this.createLegacyDocument();
      const migratedDocument =
        await SignalDataMigration.migrateSignals(legacyDocument);

      // Check version was updated
      if (migratedDocument.content.signalsVersion !== "2.0") {
        throw new Error("Version was not updated to 2.0");
      }

      // Check migration metadata exists
      if (!migratedDocument.content.migrationMetadata) {
        throw new Error("Migration metadata is missing");
      }

      // Check signals structure was updated
      const signals = migratedDocument.content.signals;
      const firstSignalKey = Object.keys(signals)[0];
      const firstSignal = signals[firstSignalKey];

      if (!firstSignal.metadata) {
        throw new Error("Enhanced signal structure is missing metadata");
      }

      if (!firstSignal.values[0].context) {
        throw new Error("Enhanced signal values are missing context");
      }

      return {
        testName: "Basic Migration",
        passed: true,
        details: {
          originalSignals: Object.keys(legacyDocument.content.signals).length,
          migratedSignals: Object.keys(migratedDocument.content.signals).length,
          migrationTime:
            migratedDocument.content.migrationMetadata.migrationTime,
        },
      };
    } catch (error) {
      return {
        testName: "Basic Migration",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test data preservation during migration
   */
  private static async testDataPreservation(): Promise<MigrationTestResult> {
    try {
      const legacyDocument = this.createLegacyDocument();
      const migratedDocument =
        await SignalDataMigration.migrateSignals(legacyDocument);

      // Verify signal count preservation
      const originalSignalCount = Object.keys(
        legacyDocument.content.signals,
      ).length;
      const migratedSignalCount = Object.keys(
        migratedDocument.content.signals,
      ).length;

      if (originalSignalCount !== migratedSignalCount) {
        throw new Error(
          `Signal count mismatch: ${originalSignalCount} vs ${migratedSignalCount}`,
        );
      }

      // Verify value preservation for each signal
      for (const [signalName, originalData] of Object.entries(
        legacyDocument.content.signals,
      )) {
        const migratedData = migratedDocument.content.signals[signalName];

        if (!migratedData) {
          throw new Error(`Missing migrated signal: ${signalName}`);
        }

        const originalValues = originalData.values || [];
        const migratedValues = migratedData.values || [];

        if (originalValues.length !== migratedValues.length) {
          throw new Error(`Value count mismatch for ${signalName}`);
        }

        // Check each value is preserved
        for (let i = 0; i < originalValues.length; i++) {
          const original = originalValues[i];
          const migrated = migratedValues[i];

          if (original.signal !== migrated.signal) {
            throw new Error(
              `Signal name mismatch: ${original.signal} vs ${migrated.signal}`,
            );
          }
          if (original.value !== migrated.value) {
            throw new Error(
              `Value mismatch: ${original.value} vs ${migrated.value}`,
            );
          }
          if (original.date !== migrated.date) {
            throw new Error(
              `Date mismatch: ${original.date} vs ${migrated.date}`,
            );
          }
        }
      }

      return {
        testName: "Data Preservation",
        passed: true,
        details: {
          signalsChecked: originalSignalCount,
          totalValuesChecked: this.countTotalValues(
            legacyDocument.content.signals,
          ),
        },
      };
    } catch (error) {
      return {
        testName: "Data Preservation",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test idempotent migration (running twice should have no effect)
   */
  private static async testIdempotentMigration(): Promise<MigrationTestResult> {
    try {
      const legacyDocument = this.createLegacyDocument();

      // First migration
      const firstMigration =
        await SignalDataMigration.migrateSignals(legacyDocument);

      // Second migration should not change anything
      const secondMigration =
        await SignalDataMigration.migrateSignals(firstMigration);

      // Compare results
      if (
        JSON.stringify(firstMigration.content.signals) !==
        JSON.stringify(secondMigration.content.signals)
      ) {
        throw new Error("Second migration changed the signals structure");
      }

      if (
        firstMigration.content.signalsVersion !==
        secondMigration.content.signalsVersion
      ) {
        throw new Error("Version changed during second migration");
      }

      return {
        testName: "Idempotent Migration",
        passed: true,
        details: {
          firstMigrationTime:
            firstMigration.content.migrationMetadata.migrationTime,
          // Second migration should be much faster (no actual work)
        },
      };
    } catch (error) {
      return {
        testName: "Idempotent Migration",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test edge cases and malformed data handling
   */
  private static async testEdgeCases(): Promise<MigrationTestResult> {
    try {
      // Test with empty signals
      const emptyDocument = this.createDocumentWithEmptySignals();
      const migratedEmpty =
        await SignalDataMigration.migrateSignals(emptyDocument);

      if (Object.keys(migratedEmpty.content.signals || {}).length !== 0) {
        throw new Error("Empty signals document was modified");
      }

      // Test with malformed signal data
      const malformedDocument = this.createMalformedDocument();
      const migratedMalformed =
        await SignalDataMigration.migrateSignals(malformedDocument);

      // Should complete without throwing errors
      if (!migratedMalformed.content.signalsVersion) {
        throw new Error("Malformed document migration failed");
      }

      // Test with missing values array
      const missingValuesDocument = this.createDocumentWithMissingValues();
      const migratedMissingValues = await SignalDataMigration.migrateSignals(
        missingValuesDocument,
      );

      if (!migratedMissingValues.content.signals) {
        throw new Error(
          "Document with missing values was not handled properly",
        );
      }

      return {
        testName: "Edge Cases",
        passed: true,
        details: {
          emptySignalsHandled: true,
          malformedDataHandled: true,
          missingValuesHandled: true,
        },
      };
    } catch (error) {
      return {
        testName: "Edge Cases",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test migration performance
   */
  private static async testMigrationPerformance(): Promise<MigrationTestResult> {
    try {
      const largeDocument = this.createLargeDocument(100); // 100 signals
      const startTime = Date.now();

      const migratedDocument =
        await SignalDataMigration.migrateSignals(largeDocument);

      const migrationTime = Date.now() - startTime;
      const maxAllowedTime = 5000; // 5 seconds

      if (migrationTime > maxAllowedTime) {
        throw new Error(
          `Migration took too long: ${migrationTime}ms (max: ${maxAllowedTime}ms)`,
        );
      }

      return {
        testName: "Migration Performance",
        passed: true,
        details: {
          signalCount: 100,
          migrationTimeMs: migrationTime,
          maxAllowedTimeMs: maxAllowedTime,
        },
      };
    } catch (error) {
      return {
        testName: "Migration Performance",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test backwards compatibility
   */
  private static async testBackwardsCompatibility(): Promise<MigrationTestResult> {
    try {
      const legacyDocument = this.createLegacyDocument();
      const migratedDocument =
        await SignalDataMigration.migrateSignals(legacyDocument);

      // Test that legacy signal access patterns still work
      const signals = migratedDocument.content.signals;

      for (const [signalName, signalData] of Object.entries(signals)) {
        // Should still have log property
        if (!signalData.log) {
          throw new Error(`Missing log property for signal ${signalName}`);
        }

        // Should still have values array
        if (!Array.isArray(signalData.values)) {
          throw new Error(`Values is not an array for signal ${signalName}`);
        }

        // Each value should have original fields
        for (const value of signalData.values) {
          if (!value.signal || !value.value || !value.date) {
            throw new Error(`Missing required fields in signal value`);
          }
        }
      }

      return {
        testName: "Backwards Compatibility",
        passed: true,
        details: {
          signalsChecked: Object.keys(signals).length,
          compatibilityMaintained: true,
        },
      };
    } catch (error) {
      return {
        testName: "Backwards Compatibility",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a legacy document for testing
   */
  private static createLegacyDocument(): Document {
    return {
      id: "test-doc-1",
      content: {
        signals: {
          glucose: {
            log: "full",
            history: [],
            values: [
              {
                signal: "glucose",
                value: 95,
                unit: "mg/dL",
                reference: "70-100",
                date: "2024-01-15T10:00:00Z",
                urgency: 1,
                source: "extracted",
              },
              {
                signal: "glucose",
                value: 105,
                unit: "mg/dL",
                reference: "70-100",
                date: "2024-01-10T10:00:00Z",
                urgency: 2,
                source: "extracted",
              },
            ],
          },
          hemoglobin: {
            log: "full",
            history: [],
            values: [
              {
                signal: "hemoglobin",
                value: 14.2,
                unit: "g/dL",
                reference: "12-16",
                date: "2024-01-15T10:00:00Z",
                urgency: 1,
                source: "extracted",
              },
            ],
          },
        },
      },
      metadata: {
        type: "laboratory",
      },
    } as Document;
  }

  /**
   * Create document with empty signals
   */
  private static createDocumentWithEmptySignals(): Document {
    return {
      id: "test-doc-empty",
      content: {
        signals: {},
      },
      metadata: {},
    } as Document;
  }

  /**
   * Create malformed document
   */
  private static createMalformedDocument(): Document {
    return {
      id: "test-doc-malformed",
      content: {
        signals: {
          badSignal: {
            log: "full",
            history: [],
            values: "not an array", // Malformed
          },
          incompleteSignal: {
            // Missing required fields
          },
        },
      },
      metadata: {},
    } as Document;
  }

  /**
   * Create document with missing values
   */
  private static createDocumentWithMissingValues(): Document {
    return {
      id: "test-doc-missing-values",
      content: {
        signals: {
          signalWithoutValues: {
            log: "full",
            history: [],
            // values array is missing
          },
        },
      },
      metadata: {},
    } as Document;
  }

  /**
   * Create large document for performance testing
   */
  private static createLargeDocument(signalCount: number): Document {
    const signals: any = {};

    for (let i = 0; i < signalCount; i++) {
      signals[`test_signal_${i}`] = {
        log: "full",
        history: [],
        values: [
          {
            signal: `test_signal_${i}`,
            value: Math.random() * 100,
            unit: "mg/dL",
            reference: "0-100",
            date: new Date().toISOString(),
            urgency: 1,
            source: "extracted",
          },
        ],
      };
    }

    return {
      id: "test-doc-large",
      content: { signals },
      metadata: { type: "laboratory" },
    } as Document;
  }

  /**
   * Count total values across all signals
   */
  private static countTotalValues(signals: any): number {
    let count = 0;
    for (const signalData of Object.values(signals)) {
      count += (signalData as any).values?.length || 0;
    }
    return count;
  }

  /**
   * Log test results in a formatted way
   */
  static logTestResults(suite: MigrationTestSuite): void {
    console.log(`\n📋 ${suite.suiteName}`);
    console.log(`${"=".repeat(50)}`);
    console.log(
      `📊 Results: ${suite.passedTests}/${suite.totalTests} tests passed`,
    );
    console.log(`✅ Passed: ${suite.passedTests}`);
    console.log(`❌ Failed: ${suite.failedTests}`);
    console.log(`🎯 Overall: ${suite.overallPassed ? "PASSED" : "FAILED"}`);

    console.log(`\n📝 Test Details:`);
    suite.tests.forEach((test, index) => {
      const status = test.passed ? "✅" : "❌";
      console.log(`${index + 1}. ${status} ${test.testName}`);

      if (!test.passed && test.error) {
        console.log(`   Error: ${test.error}`);
      }

      if (test.details) {
        console.log(`   Details:`, test.details);
      }
    });

    console.log(`${"=".repeat(50)}\n`);
  }
}
