import { describe, it, expect } from "vitest";
import {
  detectDocumentType,
  shouldUseSpecializedViewer,
  getViewerComponentName,
  DOCUMENT_TYPE_MAPPINGS,
  type DocumentTypeInfo,
} from "./document-type-detector";
import type { Document } from "./types.d";

function makeDocument(overrides: Partial<Document["content"]> = {}): Document {
  return {
    type: "document" as any,
    id: "doc-1",
    key: "key-1",
    user_id: "user-1",
    metadata: { title: "Test", tags: [] },
    content: {
      title: "Test Document",
      tags: [],
      ...overrides,
    },
    attachments: [],
    owner_id: "user-1",
  };
}

describe("DOCUMENT_TYPE_MAPPINGS", () => {
  it("has all expected document types", () => {
    const types = Object.keys(DOCUMENT_TYPE_MAPPINGS);
    expect(types).toContain("surgical");
    expect(types).toContain("pathology");
    expect(types).toContain("cardiology");
    expect(types).toContain("radiology");
    expect(types).toContain("laboratory");
    expect(types).toContain("consultation");
  });

  it("specialized types have viewer names", () => {
    expect(DOCUMENT_TYPE_MAPPINGS.surgical.viewer).toBe(
      "SurgicalReportViewer",
    );
    expect(DOCUMENT_TYPE_MAPPINGS.pathology.viewer).toBe(
      "PathologyReportViewer",
    );
    expect(DOCUMENT_TYPE_MAPPINGS.cardiology.viewer).toBe(
      "CardiologyReportViewer",
    );
    expect(DOCUMENT_TYPE_MAPPINGS.radiology.viewer).toBe(
      "RadiologyReportViewer",
    );
  });

  it("standard types have no viewer", () => {
    expect(DOCUMENT_TYPE_MAPPINGS.laboratory.viewer).toBeNull();
    expect(DOCUMENT_TYPE_MAPPINGS.consultation.viewer).toBeNull();
  });
});

describe("detectDocumentType", () => {
  it("uses enhancedFields.documentType when present", () => {
    const doc = makeDocument({
      enhancedFields: { documentType: "surgical", confidence: 0.95 },
    });
    const result = detectDocumentType(doc);
    expect(result.primaryType).toBe("surgical");
    expect(result.confidence).toBe(0.95);
    expect(result.specializedViewer).toBe("SurgicalReportViewer");
    expect(result.useSpecializedUI).toBe(true);
  });

  it("uses default confidence 0.9 when enhancedFields has no confidence", () => {
    const doc = makeDocument({
      enhancedFields: { documentType: "pathology" },
    });
    const result = detectDocumentType(doc);
    expect(result.confidence).toBe(0.9);
  });

  it("falls back to keyword analysis when no enhancedFields", () => {
    const doc = makeDocument({
      title: "Cardiac Echocardiogram Report",
      summary: "Echo findings for heart evaluation",
    });
    const result = detectDocumentType(doc);
    expect(result.primaryType).toBe("cardiology");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("detects radiology from keywords", () => {
    const doc = makeDocument({
      title: "CT Scan Report",
      summary: "MRI imaging of the abdomen with ultrasound comparison",
    });
    const result = detectDocumentType(doc);
    expect(result.primaryType).toBe("radiology");
  });

  it("detects pathology from keywords", () => {
    const doc = makeDocument({
      title: "Biopsy Report",
      summary: "Histology specimen from pathology lab",
    });
    const result = detectDocumentType(doc);
    expect(result.primaryType).toBe("pathology");
  });

  it("detects surgical from keywords", () => {
    const doc = makeDocument({
      title: "Operative Report",
      summary: "Surgery procedure on the left knee",
    });
    const result = detectDocumentType(doc);
    expect(result.primaryType).toBe("surgical");
  });

  it("detects laboratory from keywords", () => {
    const doc = makeDocument({
      title: "Blood Test Results",
      summary: "Laboratory analysis of urine and blood samples",
    });
    const result = detectDocumentType(doc);
    expect(result.primaryType).toBe("laboratory");
  });

  it("uses tags for detection", () => {
    const doc = makeDocument({
      title: "Report",
      tags: ["cardiac", "echo", "heart"],
    });
    const result = detectDocumentType(doc);
    expect(result.primaryType).toBe("cardiology");
  });

  it("defaults to consultation for ambiguous content", () => {
    const doc = makeDocument({
      title: "General Notes",
      summary: "Follow-up visit",
    });
    const result = detectDocumentType(doc);
    expect(result.primaryType).toBe("consultation");
  });

  it("caps confidence at 0.95", () => {
    // Load up with all keywords for a type
    const doc = makeDocument({
      title: "surgery procedure operation surgical operative",
    });
    const result = detectDocumentType(doc);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it("includes requiredSections from mapping", () => {
    const doc = makeDocument({
      enhancedFields: { documentType: "surgical" },
    });
    const result = detectDocumentType(doc);
    expect(result.requiredSections).toContain("summary");
    expect(result.requiredSections).toContain("procedure");
  });

  it("includes optionalSections", () => {
    const doc = makeDocument({
      enhancedFields: { documentType: "surgical" },
    });
    const result = detectDocumentType(doc);
    expect(result.optionalSections).toContain("attachments");
    expect(result.optionalSections).toContain("body");
  });

  it("does not use specializedUI for standard types via keyword fallback", () => {
    const doc = makeDocument({
      title: "Lab Results",
      summary: "Blood laboratory analysis",
    });
    const result = detectDocumentType(doc);
    expect(result.useSpecializedUI).toBe(false);
  });

  it("ignores unknown enhancedFields.documentType", () => {
    const doc = makeDocument({
      enhancedFields: { documentType: "unknown_type" },
      title: "Surgical operative procedure report for surgery",
    });
    const result = detectDocumentType(doc);
    // Falls through to keyword-based detection
    expect(result.primaryType).toBe("surgical");
  });
});

describe("shouldUseSpecializedViewer", () => {
  it("returns true when all conditions met", () => {
    const typeInfo: DocumentTypeInfo = {
      primaryType: "surgical",
      confidence: 0.8,
      specializedViewer: "SurgicalReportViewer",
      requiredSections: [],
      optionalSections: [],
      useSpecializedUI: true,
    };
    expect(
      shouldUseSpecializedViewer(typeInfo, { ENABLE_SPECIALIZED_UI: true }),
    ).toBe(true);
  });

  it("returns false when feature flag is off", () => {
    const typeInfo: DocumentTypeInfo = {
      primaryType: "surgical",
      confidence: 0.8,
      specializedViewer: "SurgicalReportViewer",
      requiredSections: [],
      optionalSections: [],
      useSpecializedUI: true,
    };
    expect(
      shouldUseSpecializedViewer(typeInfo, { ENABLE_SPECIALIZED_UI: false }),
    ).toBe(false);
  });

  it("returns false when useSpecializedUI is false", () => {
    const typeInfo: DocumentTypeInfo = {
      primaryType: "laboratory",
      confidence: 0.8,
      requiredSections: [],
      optionalSections: [],
      useSpecializedUI: false,
    };
    expect(
      shouldUseSpecializedViewer(typeInfo, { ENABLE_SPECIALIZED_UI: true }),
    ).toBe(false);
  });

  it("returns false when confidence is too low", () => {
    const typeInfo: DocumentTypeInfo = {
      primaryType: "surgical",
      confidence: 0.5,
      specializedViewer: "SurgicalReportViewer",
      requiredSections: [],
      optionalSections: [],
      useSpecializedUI: true,
    };
    expect(
      shouldUseSpecializedViewer(typeInfo, { ENABLE_SPECIALIZED_UI: true }),
    ).toBe(false);
  });
});

describe("getViewerComponentName", () => {
  it("returns viewer name when present", () => {
    const typeInfo: DocumentTypeInfo = {
      primaryType: "surgical",
      confidence: 0.8,
      specializedViewer: "SurgicalReportViewer",
      requiredSections: [],
      optionalSections: [],
      useSpecializedUI: true,
    };
    expect(getViewerComponentName(typeInfo)).toBe("SurgicalReportViewer");
  });

  it("returns null when no specialized viewer", () => {
    const typeInfo: DocumentTypeInfo = {
      primaryType: "consultation",
      confidence: 0.5,
      requiredSections: [],
      optionalSections: [],
      useSpecializedUI: false,
    };
    expect(getViewerComponentName(typeInfo)).toBeNull();
  });
});
