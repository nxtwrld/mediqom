/**
 * Test Suite for Enhanced Health Signals Processing
 *
 * Tests the processHealthData function and META_HISTORIES integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetaHistoryEntryType } from "./meta-history-types";

// Mock all external dependencies
vi.mock("$lib/documents", () => ({
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock("$lib/profiles", () => ({
  profiles: {
    get: vi.fn(),
  },
  updateProfile: vi.fn(),
}));

vi.mock("$lib/signals/migration", () => ({
  SignalDataMigration: {
    checkAndMigrate: vi.fn((doc) => doc),
  },
}));

vi.mock("./meta-history-storage", () => ({
  insertMetaHistoryEntries: vi.fn(),
  queryMetaHistory: vi.fn().mockResolvedValue([]),
}));

// Import the mocked functions and the module under test
import { getDocument, updateDocument } from "$lib/documents";
import { profiles, updateProfile } from "$lib/profiles";

describe("Enhanced Health Signals Processing", () => {
  const mockPatientId = "patient-123";
  const mockDocumentId = "health-doc-456";

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(profiles.get).mockResolvedValue({
      id: mockPatientId,
      healthDocumentId: mockDocumentId,
      health: {
        signals: {},
        medications: [],
        allergies: [],
      },
    } as any);

    vi.mocked(getDocument).mockResolvedValue({
      id: mockDocumentId,
      content: {
        title: 'Test Document',
        tags: [],
        signals: {},
      },
    } as any);

    vi.mocked(updateDocument).mockResolvedValue(undefined);
    vi.mocked(updateProfile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("processHealthData function", () => {
    it("should handle legacy Signal[] format", async () => {
      // Import the function
      const { processHealthData } = await import("./signals");

      const legacySignals = [
        {
          signal: "blood_pressure",
          value: "120/80",
          unit: "mmHg",
          date: "2024-01-15T10:00:00Z",
          confidence: 0.9,
          test: "Blood Pressure",
        },
      ];

      await processHealthData(legacySignals, mockPatientId, "test-doc-1");

      expect(profiles.get).toHaveBeenCalledWith(mockPatientId);
      expect(getDocument).toHaveBeenCalledWith(mockDocumentId);
      expect(updateDocument).toHaveBeenCalled();
      expect(updateProfile).toHaveBeenCalled();
    });

    it("should handle new extracted document format", async () => {
      const { processHealthData } = await import("./signals");
      const { insertMetaHistoryEntries } = await import(
        "./meta-history-storage"
      );

      const extractedData = {
        medications: [
          {
            name: "Lisinopril",
            dosage: "10mg",
            frequency: "daily",
            status: "current",
            date: "2024-01-15T08:00:00Z",
          },
        ],
        diagnoses: [
          {
            condition: "Hypertension",
            icd10: "I10",
            date: "2024-01-14T00:00:00Z",
          },
        ],
        signals: [
          {
            signal: "systolic_bp",
            value: "140",
            unit: "mmHg",
            date: "2024-01-15T10:00:00Z",
          },
        ],
      };

      await processHealthData(extractedData, mockPatientId, "test-doc-2");

      // Should call META_HISTORIES insertion
      expect(insertMetaHistoryEntries).toHaveBeenCalled();

      // Should also maintain legacy signals
      expect(updateDocument).toHaveBeenCalled();
      expect(updateProfile).toHaveBeenCalled();
    });

    it("should create medication effectiveness entries", async () => {
      const { processHealthData } = await import("./signals");
      const { insertMetaHistoryEntries } = await import(
        "./meta-history-storage"
      );

      const medicationWithEffectiveness = {
        medications: [
          {
            name: "Metformin",
            dosage: "500mg",
            status: "current",
            effectiveness: "good",
            response: "blood sugar improved",
            date: "2024-01-15T08:00:00Z",
          },
        ],
      };

      await processHealthData(
        medicationWithEffectiveness,
        mockPatientId,
        "test-doc-3",
      );

      expect(insertMetaHistoryEntries).toHaveBeenCalled();

      // Get the call arguments to check the entries
      const callArgs = vi.mocked(insertMetaHistoryEntries).mock.calls[0][0];
      expect(Array.isArray(callArgs)).toBe(true);

      // Should have both medication and effectiveness entries
      const entryTypes = callArgs.map((entry: any) => entry.entryType);
      expect(entryTypes).toContain(MetaHistoryEntryType.MEDICATION_CURRENT);
      expect(entryTypes).toContain(
        MetaHistoryEntryType.MEDICATION_EFFECTIVENESS,
      );
    });

    it("should create adverse reaction entries", async () => {
      const { processHealthData } = await import("./signals");
      const { insertMetaHistoryEntries } = await import(
        "./meta-history-storage"
      );

      const medicationWithSideEffects = {
        medications: [
          {
            name: "Penicillin",
            status: "current",
            sideEffects: "nausea, headache",
            reactionSeverity: "mild",
            date: "2024-01-15T08:00:00Z",
          },
        ],
      };

      await processHealthData(
        medicationWithSideEffects,
        mockPatientId,
        "test-doc-4",
      );

      expect(insertMetaHistoryEntries).toHaveBeenCalled();

      const callArgs = vi.mocked(insertMetaHistoryEntries).mock.calls[0][0];
      const entryTypes = callArgs.map((entry: any) => entry.entryType);
      expect(entryTypes).toContain(MetaHistoryEntryType.MEDICATION_CURRENT);
      expect(entryTypes).toContain(MetaHistoryEntryType.ADVERSE_REACTION);
    });

    it("should sync medications with profile storage", async () => {
      const { processHealthData } = await import("./signals");

      const extractedData = {
        medications: [
          {
            name: "Aspirin",
            dosage: "81mg",
            frequency: "daily",
            status: "current",
            prescriber: "Dr. Smith",
          },
        ],
      };

      await processHealthData(extractedData, mockPatientId, "test-doc-5");

      // Check that profile was updated with current medications
      const updateProfileCall = vi.mocked(updateProfile).mock.calls[0];
      expect(updateProfileCall).toBeDefined();

      const updatedProfile = updateProfileCall[0];
      expect(updatedProfile.health.medications).toBeDefined();
      expect(Array.isArray(updatedProfile.health.medications)).toBe(true);
    });

    it("should sync allergies with profile storage", async () => {
      const { processHealthData } = await import("./signals");

      const extractedData = {
        allergies: [
          {
            allergen: "Shellfish",
            reaction: "hives",
            severity: "moderate",
          },
        ],
      };

      await processHealthData(extractedData, mockPatientId, "test-doc-6");

      const updateProfileCall = vi.mocked(updateProfile).mock.calls[0];
      const updatedProfile = updateProfileCall[0];
      expect(updatedProfile.health.allergies).toBeDefined();
      expect(Array.isArray(updatedProfile.health.allergies)).toBe(true);
    });
  });

  describe("getDashboardData function", () => {
    it("should return unified dashboard data", async () => {
      const { getDashboardData } = await import("./signals");

      // Mock profile with health data
      vi.mocked(profiles.get).mockResolvedValue({
        id: mockPatientId,
        healthDocumentId: mockDocumentId,
        health: {
          medications: [{ name: "Aspirin", dosage: "81mg" }],
          allergies: [{ allergen: "Penicillin", severity: "moderate" }],
          signals: {},
        },
      } as any);

      const dashboardData = await getDashboardData(mockPatientId);

      expect(dashboardData.currentMedications).toHaveLength(1);
      expect(dashboardData.currentMedications[0].name).toBe("Aspirin");
      expect(dashboardData.activeAllergies).toHaveLength(1);
      expect(dashboardData.activeAllergies[0].allergen).toBe("Penicillin");
      expect(dashboardData.signals).toBeDefined();
      expect(Array.isArray(dashboardData.recentMedicationEvents)).toBe(true);
      expect(Array.isArray(dashboardData.clinicalTrends)).toBe(true);
      expect(Array.isArray(dashboardData.significantChanges)).toBe(true);
    });

    it("should handle profiles without health data", async () => {
      const { getDashboardData } = await import("./signals");

      // Mock profile without health data
      vi.mocked(profiles.get).mockResolvedValue({
        id: mockPatientId,
        healthDocumentId: mockDocumentId,
        health: {},
      } as any);

      const dashboardData = await getDashboardData(mockPatientId);

      expect(dashboardData.currentMedications).toEqual([]);
      expect(dashboardData.activeAllergies).toEqual([]);
      expect(dashboardData.signals).toEqual({});
    });
  });

  describe("Legacy compatibility", () => {
    it("should maintain backward compatibility with updateSignals", async () => {
      const { updateSignals } = await import("./signals");

      const legacySignals = [
        {
          signal: "heart_rate",
          value: "72",
          unit: "bpm",
          date: "2024-01-15T10:00:00Z",
        },
      ];

      // Should not throw error
      await expect(
        updateSignals(legacySignals, mockPatientId, "legacy-doc"),
      ).resolves.not.toThrow();

      expect(profiles.get).toHaveBeenCalled();
      expect(updateDocument).toHaveBeenCalled();
    });

    it("should handle empty data gracefully", async () => {
      const { processHealthData } = await import("./signals");

      await expect(
        processHealthData([], mockPatientId, "empty-doc"),
      ).resolves.not.toThrow();
      await expect(
        processHealthData({}, mockPatientId, "empty-obj-doc"),
      ).resolves.not.toThrow();
    });
  });

  describe("Error handling", () => {
    it("should handle profile fetch errors", async () => {
      const { processHealthData } = await import("./signals");

      vi.mocked(profiles.get).mockRejectedValue(new Error("Profile not found"));

      await expect(
        processHealthData([], mockPatientId, "error-doc"),
      ).rejects.toThrow("Profile not found");
    });

    it("should handle document update errors", async () => {
      const { processHealthData } = await import("./signals");

      vi.mocked(updateDocument).mockRejectedValue(new Error("Update failed"));

      await expect(
        processHealthData(
          [
            {
              signal: "test",
              value: "1",
              date: "2024-01-15T10:00:00Z",
            },
          ],
          mockPatientId,
          "error-doc",
        ),
      ).rejects.toThrow("Update failed");
    });

    it("should handle invalid data formats gracefully", async () => {
      const { processHealthData } = await import("./signals");

      const invalidData = {
        medications: "not-an-array",
        allergies: null,
        signals: undefined,
      };

      // Should not throw but should handle gracefully
      await expect(
        processHealthData(invalidData, mockPatientId, "invalid-doc"),
      ).resolves.not.toThrow();
    });
  });

  describe("Data transformation", () => {
    it("should correctly transform medication data", async () => {
      const { processHealthData } = await import("./signals");
      const { insertMetaHistoryEntries } = await import(
        "./meta-history-storage"
      );

      const medicationData = {
        medications: [
          {
            name: "Warfarin",
            dosage: "5mg",
            frequency: "daily",
            status: "current",
            indication: "anticoagulation",
            prescriber: "Dr. Johnson",
            startDate: "2024-01-10T00:00:00Z",
          },
        ],
      };

      await processHealthData(medicationData, mockPatientId, "med-doc");

      expect(insertMetaHistoryEntries).toHaveBeenCalled();

      const entries = vi.mocked(insertMetaHistoryEntries).mock.calls[0][0];
      const medicationEntry = entries.find(
        (e: any) => e.entryType === MetaHistoryEntryType.MEDICATION_CURRENT,
      );

      expect(medicationEntry).toBeDefined();
      expect(medicationEntry?.data.name).toBe("Warfarin");
      expect(medicationEntry?.data.dosage).toBe("5mg");
      expect(medicationEntry?.tags).toContain("medication");
      expect(medicationEntry?.category).toBe("medication");
      expect(medicationEntry?.searchableText).toContain("Warfarin");
    });

    it("should correctly transform lab result data", async () => {
      const { processHealthData } = await import("./signals");
      const { insertMetaHistoryEntries } = await import(
        "./meta-history-storage"
      );

      const labData = {
        labResults: [
          {
            test: "Hemoglobin A1C",
            value: "6.2",
            unit: "%",
            referenceRange: "< 5.7%",
            abnormal: false,
            date: "2024-01-15T08:00:00Z",
          },
        ],
      };

      await processHealthData(labData, mockPatientId, "lab-doc");

      const entries = vi.mocked(insertMetaHistoryEntries).mock.calls[0][0];
      const labEntry = entries.find(
        (e: any) => e.entryType === MetaHistoryEntryType.MEASUREMENT_LAB,
      );

      expect(labEntry).toBeDefined();
      expect(labEntry?.data.test).toBe("Hemoglobin A1C");
      expect(labEntry?.data.value).toBe("6.2");
      expect(labEntry?.tags).toContain("laboratory");
      expect(labEntry?.category).toBe("measurement");
      expect(labEntry?.subcategory).toBe("laboratory");
    });
  });
});
