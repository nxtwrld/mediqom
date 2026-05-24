import { describe, it, expect } from "vitest";
import {
  fromCurrentMedication,
  fromNewPrescription,
  extractMedicationsFromDocument,
} from "./convert";
import type { Document } from "$lib/documents/types.d";

describe("fromCurrentMedication", () => {
  it("always includes medicationName (even when other fields are absent)", () => {
    const result = fromCurrentMedication({ medicationName: "Aspirin" });
    expect(result.medicationName).toBe("Aspirin");
    // Fields not supplied should not appear
    expect(result.dosage).toBeUndefined();
    expect(result.schedule).toBeUndefined();
  });

  it("maps all provided top-level fields", () => {
    const result = fromCurrentMedication({
      medicationName: "Aspirin",
      genericName: "acetylsalicylic acid",
      brandName: "Aspirin",
      strength: "81mg",
      dosage: "1 tab",
      route: "oral",
      form: "tablet",
      indication: "cardioprotection",
      prescriber: "Dr. X",
      notes: "daily",
      lastFilled: "2026-04-01",
    });

    expect(result).toMatchObject({
      medicationName: "Aspirin",
      genericName: "acetylsalicylic acid",
      brandName: "Aspirin",
      strength: "81mg",
      dosage: "1 tab",
      route: "oral",
      form: "tablet",
      indication: "cardioprotection",
      prescriber: "Dr. X",
      notes: "daily",
      lastFilled: "2026-04-01",
    });
  });

  it("renames 'adherence' to 'adherenceLevel'", () => {
    const result = fromCurrentMedication({
      medicationName: "X",
      adherence: "high",
    });
    expect(result.adherenceLevel).toBe("high");
    expect((result as any).adherence).toBeUndefined();
  });

  it("wraps startDate into a schedule object when present", () => {
    const result = fromCurrentMedication({
      medicationName: "X",
      startDate: "2026-01-01",
    });
    expect(result.schedule).toEqual({
      frequency: "daily",
      times: [],
      startDate: "2026-01-01",
    });
  });

  it("omits falsy optional fields (empty string, undefined)", () => {
    const result = fromCurrentMedication({
      medicationName: "X",
      genericName: "",
      brandName: undefined,
      sideEffects: null,
    });
    expect((result as any).genericName).toBeUndefined();
    expect((result as any).brandName).toBeUndefined();
    expect((result as any).sideEffects).toBeUndefined();
  });
});

describe("fromNewPrescription", () => {
  it("maps prescriber.name → prescriber (flat)", () => {
    const result = fromNewPrescription({
      medicationName: "X",
      prescriber: { name: "Dr. Y" },
    });
    expect(result.prescriber).toBe("Dr. Y");
  });

  it("includes prescriptionDate, duration, and instructions", () => {
    const result = fromNewPrescription({
      medicationName: "X",
      prescriptionDate: "2026-04-14",
      duration: "7 days",
      instructions: "take with food",
    });
    expect(result.prescriptionDate).toBe("2026-04-14");
    expect(result.duration).toBe("7 days");
    expect(result.instructions).toBe("take with food");
  });

  it("does not include prescriber when prescriber.name is missing", () => {
    const result = fromNewPrescription({
      medicationName: "X",
      prescriber: {},
    });
    expect(result.prescriber).toBeUndefined();
  });
});

describe("extractMedicationsFromDocument", () => {
  function doc(content: any, overrides: Partial<Document> = {}): Document {
    return {
      id: "doc-1",
      content,
      ...overrides,
    } as Document;
  }

  it("returns an empty array when the document has no medications section", () => {
    expect(extractMedicationsFromDocument(doc({}))).toEqual([]);
  });

  it("extracts from currentMedications", () => {
    const result = extractMedicationsFromDocument(
      doc({
        medications: {
          currentMedications: [{ medicationName: "Aspirin" }],
        },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].medicationName).toBe("Aspirin");
    expect(result[0].sourceDocumentId).toBe("doc-1");
  });

  it("extracts from newPrescriptions", () => {
    const result = extractMedicationsFromDocument(
      doc({
        medications: {
          newPrescriptions: [{ medicationName: "Ibuprofen" }],
        },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].medicationName).toBe("Ibuprofen");
  });

  it("combines currentMedications and newPrescriptions in order", () => {
    const result = extractMedicationsFromDocument(
      doc({
        medications: {
          currentMedications: [{ medicationName: "A" }],
          newPrescriptions: [{ medicationName: "B" }, { medicationName: "C" }],
        },
      }),
    );
    expect(result.map((m) => m.medicationName)).toEqual(["A", "B", "C"]);
  });

  it("propagates sourceDocumentDate from metadata.date", () => {
    const result = extractMedicationsFromDocument(
      doc({ medications: { currentMedications: [{ medicationName: "A" }] } }, {
        metadata: { date: "2026-03-15" },
      } as any),
    );
    expect(result[0].sourceDocumentDate).toBe("2026-03-15");
  });

  it("falls back to content.date when metadata.date is missing", () => {
    const result = extractMedicationsFromDocument(
      doc({
        date: "2026-03-15",
        medications: { currentMedications: [{ medicationName: "A" }] },
      }),
    );
    expect(result[0].sourceDocumentDate).toBe("2026-03-15");
  });

  it("omits sourceDocumentDate when no date is available", () => {
    const result = extractMedicationsFromDocument(
      doc({
        medications: { currentMedications: [{ medicationName: "A" }] },
      }),
    );
    expect(result[0].sourceDocumentDate).toBeUndefined();
  });
});
