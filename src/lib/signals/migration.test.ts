import { describe, it, expect, vi } from "vitest";

// Mock the document update side-effect so checkAndMigrate doesn't fail.
vi.mock("$lib/documents", () => ({
  updateDocument: vi.fn().mockResolvedValue(undefined),
}));

// Mock signal catalog for resolveSignalDefinition.
vi.mock("$data/signal-catalog", () => ({
  getSignal: (name: string) => {
    if (name === "glucose") {
      return {
        description: "Blood glucose",
        unit: "mg/dL",
        category: "laboratory",
        synonyms: ["blood sugar"],
        referenceRange: [
          { sex: "any", ageRange: { min: 18, max: 120 }, low: 70, high: 110 },
        ],
      };
    }
    return undefined;
  },
}));

import { SignalDataMigration } from "./migration";
import type { Document } from "$lib/documents/types.d";

// ─── Helpers ────────────────────────────────────────────

function makeDoc(
  signals: Record<string, any>,
  version?: string,
): Document {
  return {
    id: "doc-1",
    content: {
      signals,
      ...(version ? { signalsVersion: version } : {}),
    },
    metadata: { type: "laboratory" },
  } as any;
}

const LEGACY_SIGNAL = {
  log: "full",
  history: [{ date: "2024-01-01", value: "5.0" }],
  values: [
    {
      signal: "Glucose",
      value: "5.0",
      unit: "mmol/L",
      reference: "3.9-5.6",
      date: "2024-01-01",
      source: "input",
    },
  ],
};

const ENHANCED_SIGNAL = {
  log: "full",
  values: [
    {
      signal: "Glucose",
      value: "5.0",
      date: "2024-01-01",
      context: { documentType: "lab" },
      validation: { status: "validated" },
    },
  ],
  metadata: {
    lastUpdated: "2024-01-01",
    migrationSource: "legacy_v1",
  },
};

// ─── Tests ──────────────────────────────────────────────

describe("SignalDataMigration.needsMigration", () => {
  it("returns false when document has no signals", () => {
    const doc = makeDoc({});
    expect(SignalDataMigration.needsMigration(doc)).toBe(false);
  });

  it("returns false when signalsVersion matches CURRENT_VERSION", () => {
    const doc = makeDoc({ glucose: LEGACY_SIGNAL }, "2.0");
    expect(SignalDataMigration.needsMigration(doc)).toBe(false);
  });

  it("returns true for legacy format (has 'history' field, no 'metadata')", () => {
    const doc = makeDoc({ glucose: LEGACY_SIGNAL });
    expect(SignalDataMigration.needsMigration(doc)).toBe(true);
  });

  it("returns false for enhanced format (has 'metadata' field)", () => {
    const doc = makeDoc({ glucose: ENHANCED_SIGNAL });
    expect(SignalDataMigration.needsMigration(doc)).toBe(false);
  });

  it("detects legacy when values lack context/validation fields", () => {
    const noHistory = {
      log: "full",
      values: [
        { signal: "WBC", value: "7.0", date: "2024-01-01" },
      ],
    };
    const doc = makeDoc({ wbc: noHistory });
    expect(SignalDataMigration.needsMigration(doc)).toBe(true);
  });

  it("returns false for null/undefined signal entries", () => {
    const doc = makeDoc({ bad: null });
    expect(SignalDataMigration.needsMigration(doc)).toBe(false);
  });
});

describe("SignalDataMigration.migrateSignals", () => {
  it("migrates legacy signals and sets version to CURRENT", async () => {
    const doc = makeDoc({ glucose: LEGACY_SIGNAL });
    const migrated = await SignalDataMigration.migrateSignals(doc);

    expect(migrated.content.signalsVersion).toBe("2.0");
    expect(migrated.content.signals.glucose).toBeDefined();
    expect(migrated.content.signals.glucose.metadata).toBeDefined();
    expect(migrated.content.signals.glucose.metadata.migrationSource).toBe(
      "legacy_v1",
    );
  });

  it("preserves the value count during migration", async () => {
    const doc = makeDoc({
      glucose: {
        ...LEGACY_SIGNAL,
        values: [
          { signal: "Glucose", value: "5.0", date: "2024-01-01", source: "input" },
          { signal: "Glucose", value: "6.2", date: "2024-06-01", source: "input" },
        ],
      },
    });
    const migrated = await SignalDataMigration.migrateSignals(doc);
    expect(migrated.content.signals.glucose.values).toHaveLength(2);
  });

  it("returns the document unchanged when no migration is needed", async () => {
    const doc = makeDoc({ glucose: ENHANCED_SIGNAL });
    const result = await SignalDataMigration.migrateSignals(doc);
    expect(result).toBe(doc);
  });

  it("records migrationMetadata on the document content", async () => {
    const doc = makeDoc({ glucose: LEGACY_SIGNAL });
    const migrated = await SignalDataMigration.migrateSignals(doc);
    const meta = migrated.content.migrationMetadata;
    expect(meta.originalVersion).toBe("1.0");
    expect(meta.migratedSignalCount).toBe(1);
    expect(meta.warnings).toEqual([]);
  });

  it("calculates analytics on migrated signals", async () => {
    const doc = makeDoc({
      glucose: {
        log: "full",
        history: [],
        values: [
          { signal: "Glucose", value: "5.0", date: "2024-01-01", source: "input" },
          { signal: "Glucose", value: "5.5", date: "2024-02-01", source: "input" },
          { signal: "Glucose", value: "6.0", date: "2024-03-01", source: "input" },
        ],
      },
    });
    const migrated = await SignalDataMigration.migrateSignals(doc);
    const analytics = migrated.content.signals.glucose.analytics;
    expect(analytics).toBeDefined();
    expect(analytics.dataPoints).toBe(3);
    expect(typeof analytics.slope).toBe("number");
  });
});

describe("SignalDataMigration — inferSpecimen via context", () => {
  it("infers 'blood' specimen from signal name containing 'blood'", async () => {
    const doc = makeDoc({
      bloodSugar: {
        log: "full",
        history: [],
        values: [
          { signal: "Blood glucose", value: "5.0", date: "2024-01-01", source: "input" },
        ],
      },
    });
    const migrated = await SignalDataMigration.migrateSignals(doc);
    const ctx = migrated.content.signals.bloodSugar.values[0].context;
    expect(ctx.specimen).toBe("blood");
  });

  it("infers 'urine' specimen from signal name containing 'urine'", async () => {
    const doc = makeDoc({
      urinalysis: {
        log: "full",
        history: [],
        values: [
          { signal: "Urine pH", value: "6.5", date: "2024-01-01", source: "input" },
        ],
      },
    });
    const migrated = await SignalDataMigration.migrateSignals(doc);
    expect(
      migrated.content.signals.urinalysis.values[0].context.specimen,
    ).toBe("urine");
  });
});

describe("SignalDataMigration — constants", () => {
  it("CURRENT_VERSION is 2.0", () => {
    expect(SignalDataMigration.CURRENT_VERSION).toBe("2.0");
  });
  it("LEGACY_VERSION is 1.0", () => {
    expect(SignalDataMigration.LEGACY_VERSION).toBe("1.0");
  });
});
