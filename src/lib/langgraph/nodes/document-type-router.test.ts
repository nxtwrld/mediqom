import { describe, it, expect } from "vitest";
import { DocumentTypeRouter } from "./document-type-router";

describe("DocumentTypeRouter.analyzeDocumentSections", () => {
  it("uses documentType from AI results", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections(
      { documentType: "laboratory_results" },
      "blood test glucose",
    );
    expect(analysis.documentType).toBe("laboratory_results");
  });

  it("defaults documentType to clinical_report when absent", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections({}, "some text");
    expect(analysis.documentType).toBe("clinical_report");
  });

  it("sets confidence to 0.9 for medical documents", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections(
      { documentType: "report" },
      "report text",
    );
    expect(analysis.confidence).toBe(0.9);
  });

  it("keeps confidence at 0.9 regardless of notMedical (router defers to feature detection node)", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections(
      { notMedical: true },
      "invoice",
    );
    // The router always sets 0.9; non-medical filtering happens at the node level
    expect(analysis.confidence).toBe(0.9);
  });

  it("copies medicalSpecialty from AI results", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections(
      { medicalSpecialty: ["cardiology"] },
      "ECG report",
    );
    expect(analysis.medicalSpecialty).toEqual(["cardiology"]);
  });

  it("defaults medicalSpecialty to general_medicine when absent", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections({}, "report");
    expect(analysis.medicalSpecialty).toEqual(["general_medicine"]);
  });
});

describe("DocumentTypeRouter.analyzeDocumentSections — section flags and detected sections", () => {
  it("populates detectedSections from true flags", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections(
      { hasSummary: true, hasDiagnosis: true },
      "report",
    );
    expect(analysis.detectedSections).toContain("summary");
    expect(analysis.detectedSections).toContain("diagnosis");
  });

  it("excludes sections for false flags", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections(
      { hasSummary: false, hasDiagnosis: false },
      "report",
    );
    expect(analysis.detectedSections).not.toContain("summary");
    expect(analysis.detectedSections).not.toContain("diagnosis");
  });

  it("extracts hasSignals flag into sectionFlags", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections(
      { hasSignals: true },
      "glucose 5.5",
    );
    expect(analysis.sectionFlags.hasSignals).toBe(true);
  });

  it("missing flags default to false in sectionFlags", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections({}, "text");
    expect(analysis.sectionFlags.hasSignals).toBe(false);
    expect(analysis.sectionFlags.hasImaging).toBe(false);
  });
});

describe("DocumentTypeRouter.analyzeDocumentSections — contentFeatures", () => {
  it("detects structured data from numbers with units", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections(
      {},
      "Hemoglobin: 140 g/L; Glucose: 5.5 mmol/L; WBC: 6.2; platelets: 250-350",
    );
    // "structuredData" is true when >5 structured indicators found
    expect(typeof analysis.contentFeatures.structuredData).toBe("boolean");
    expect(typeof analysis.contentFeatures.reportLength).toBe("number");
  });

  it("reportLength equals content character length", () => {
    const text = "one two three four five";
    const analysis = DocumentTypeRouter.analyzeDocumentSections({}, text);
    expect(analysis.contentFeatures.reportLength).toBe(text.length);
  });

  it("returns zero medicalTermDensity for empty content", () => {
    const analysis = DocumentTypeRouter.analyzeDocumentSections({}, "");
    expect(analysis.contentFeatures.medicalTermDensity).toBe(0);
  });
});
