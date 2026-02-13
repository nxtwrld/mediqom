// Document Type Detection Service
// Analyzes document content and metadata to determine the most appropriate viewing strategy

import type { Document } from "./types.d";

export interface DocumentTypeInfo {
  primaryType: string;
  confidence: number;
  specializedViewer?: string;
  requiredSections: string[];
  optionalSections: string[];
  useSpecializedUI: boolean;
}

export const DOCUMENT_TYPE_MAPPINGS = {
  // Medical report types with specialized viewers
  surgical: {
    keywords: ["surgery", "procedure", "operation", "surgical", "operative"],
    viewer: "SurgicalReportViewer",
    sections: ["summary", "procedure", "team", "findings", "postop"],
    confidence: 0.8,
  },
  pathology: {
    keywords: ["pathology", "biopsy", "specimen", "microscopic", "histology"],
    viewer: "PathologyReportViewer",
    sections: ["summary", "specimen", "findings", "diagnosis"],
    confidence: 0.8,
  },
  cardiology: {
    keywords: ["cardiac", "heart", "ecg", "echo", "coronary"],
    viewer: "CardiologyReportViewer",
    sections: ["summary", "findings", "measurements", "interpretation"],
    confidence: 0.7,
  },
  radiology: {
    keywords: ["radiology", "imaging", "ct", "mri", "xray", "ultrasound"],
    viewer: "RadiologyReportViewer",
    sections: ["summary", "technique", "findings", "impression"],
    confidence: 0.7,
  },
  // Standard document types
  laboratory: {
    keywords: ["lab", "laboratory", "blood", "urine", "results"],
    viewer: null,
    sections: ["summary", "signals", "recommendations"],
    confidence: 0.6,
  },
  consultation: {
    keywords: ["consultation", "visit", "appointment", "assessment"],
    viewer: null,
    sections: ["summary", "diagnosis", "recommendations", "text"],
    confidence: 0.5,
  },
} as const;

/**
 * Analyzes document content to determine the most appropriate viewing strategy
 */
export function detectDocumentType(document: Document): DocumentTypeInfo {
  // Check enhanced fields from AI analysis first
  const enhancedType = document.content.enhancedFields?.documentType;
  if (enhancedType && enhancedType in DOCUMENT_TYPE_MAPPINGS) {
    const mapping =
      DOCUMENT_TYPE_MAPPINGS[
        enhancedType as keyof typeof DOCUMENT_TYPE_MAPPINGS
      ];
    return {
      primaryType: enhancedType,
      confidence: document.content.enhancedFields?.confidence || 0.9,
      specializedViewer: mapping.viewer || undefined,
      requiredSections: [...mapping.sections],
      optionalSections: getOptionalSections(enhancedType),
      useSpecializedUI: !!mapping.viewer,
    };
  }

  // Fallback to content analysis
  const content =
    `${document.content.title} ${document.content.summary || ""} ${document.content.content || ""}`.toLowerCase();
  const tags = document.content.tags?.join(" ").toLowerCase() || "";
  const searchText = `${content} ${tags}`;

  let bestMatch = {
    type: "consultation",
    confidence: 0.3,
    mapping: DOCUMENT_TYPE_MAPPINGS.consultation,
  };

  // Score each document type based on keyword matches
  for (const [type, mapping] of Object.entries(DOCUMENT_TYPE_MAPPINGS)) {
    const keywordMatches = mapping.keywords.filter((keyword) =>
      searchText.includes(keyword),
    ).length;

    const confidence = Math.min(
      (keywordMatches / mapping.keywords.length) * mapping.confidence,
      0.95,
    );

    if (confidence > bestMatch.confidence) {
      bestMatch = { type, confidence, mapping } as typeof bestMatch;
    }
  }

  return {
    primaryType: bestMatch.type,
    confidence: bestMatch.confidence,
    specializedViewer: bestMatch.mapping.viewer || undefined,
    requiredSections: [...bestMatch.mapping.sections],
    optionalSections: getOptionalSections(bestMatch.type),
    useSpecializedUI: !!bestMatch.mapping.viewer && bestMatch.confidence > 0.6,
  };
}

/**
 * Gets optional sections based on document type
 */
function getOptionalSections(documentType: string): string[] {
  const commonOptional = ["attachments", "links", "performer"];

  switch (documentType) {
    case "surgical":
      return [...commonOptional, "body", "text"];
    case "pathology":
      return [...commonOptional, "body", "recommendations"];
    case "cardiology":
      return [...commonOptional, "body", "signals"];
    case "radiology":
      return [...commonOptional, "body", "recommendations"];
    case "laboratory":
      return [...commonOptional, "diagnosis", "body", "text"];
    default:
      return commonOptional;
  }
}

/**
 * Determines if a specialized viewer should be used
 */
export function shouldUseSpecializedViewer(
  documentType: DocumentTypeInfo,
  featureFlags: { ENABLE_SPECIALIZED_UI: boolean },
): boolean {
  return (
    featureFlags.ENABLE_SPECIALIZED_UI &&
    documentType.useSpecializedUI &&
    documentType.confidence > 0.6
  );
}

/**
 * Gets the appropriate viewer component name
 */
export function getViewerComponentName(
  documentType: DocumentTypeInfo,
): string | null {
  return documentType.specializedViewer || null;
}
