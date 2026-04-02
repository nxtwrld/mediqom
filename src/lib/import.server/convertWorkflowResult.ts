import type { ReportAnalysis } from "$lib/import/types";
import anatomyObjects from "$data/objects.json";

// Build a flat set of valid 3D object names
const validObjects = new Set(
  Object.values(anatomyObjects).flatMap((cat: any) => cat.objects || []),
);

// Common anatomical synonyms → valid 3D objects
const ANATOMY_ALIASES: Record<string, string> = {
  mandible: "jaw_bone",
  maxilla: "jaw_bone",
  jaw: "jaw_bone",
  cranium: "skull",
  cerebrum: "brain",
  cerebellum: "brain",
  pulmo: "lungs",
  lung: "lungs",
  hepar: "liver",
  ren: "kidney_left",
  kidney: "kidney_left",
  cor: "heart",
  vesica: "bladder",
  colon: "large_intestine",
  intestinum: "small_intestine",
  femur: "femur_left",
  humerus: "humerus_left",
  tibia: "tibia_left",
  fibula: "fibula_left",
  scapula: "scapula_left",
  patella: "patella_left",
  clavicle: "clavicle_left",
  radius: "radius_left",
  ulna: "ulna_left",
};

function normalizeBodyPartId(id: string): string {
  if (validObjects.has(id)) return id;
  return ANATOMY_ALIASES[id.toLowerCase()] || id;
}

/**
 * Strip processing metadata properties that leak from node result wrappers.
 * These are debugging artifacts that should not be persisted in saved reports.
 * Also handles double-nested objects (e.g., { patient: { patient: {...} } }).
 */
function stripProcessingMetadata(data: any, sectionKey?: string): any {
  if (!data || typeof data !== "object") return data;

  // For arrays, strip metadata from each item
  if (Array.isArray(data)) {
    return data.map((item) => stripProcessingMetadata(item));
  }

  // Strip wrapper properties
  const { documentContext, processingNotes, processingConfidence, ...clean } =
    data;

  // Backward compatibility: unwrap double-nested objects
  // e.g., { patient: { fullName: ... } } when sectionKey is "patient" - already correct
  // e.g., { diagnosis: [...] } when sectionKey is "diagnosis" - unwrap to array
  if (
    sectionKey &&
    clean[sectionKey] !== undefined &&
    Object.keys(clean).length === 1
  ) {
    return clean[sectionKey];
  }

  return clean;
}

/**
 * Converts a LangGraph workflow result into the ReportAnalysis format.
 * Extracted from report/stream/+server.ts for reuse in job-based processing.
 */
export function convertWorkflowResult(
  workflowResult: any,
  fallbackText: string = "",
): ReportAnalysis {
  // Use structured data from multi-node processing if available, otherwise fall back to legacy
  const useStructuredData =
    workflowResult.report &&
    typeof workflowResult.report === "object" &&
    !Array.isArray(workflowResult.report);

  let actualContent;

  if (useStructuredData) {
    actualContent = {
      ...workflowResult,
      type: workflowResult.report?.type || "report",
      category: (() => {
        const featureDocumentType = workflowResult.featureDetectionResults?.documentType;
        const documentTypeToCategory: Record<string, string> = {
          laboratory_results: "laboratory",
          imaging_report: "imaging",
          radiology_report: "imaging",
          prescription: "prescription",
          immunization_record: "immunization",
          dental_record: "dental",
        };
        // Prefer feature-detection-derived category when available (more specific)
        const featureCategory = featureDocumentType ? documentTypeToCategory[featureDocumentType] : undefined;
        return (
          featureCategory ||
          workflowResult.report?.category ||
          "report"
        );
      })(),
      isMedical:
        workflowResult.report?.isMedical !== undefined
          ? workflowResult.report.isMedical
          : true,
    };
  } else {
    const medicalAnalysis = workflowResult.medicalAnalysis;
    const analysisContent =
      medicalAnalysis?.content || workflowResult.content || {};
    actualContent = analysisContent;
  }

  // Build comprehensive report object by merging all specialized medical sections
  const reportBase = useStructuredData
    ? workflowResult.report
    : actualContent.report || {};
  const reportObject = Array.isArray(reportBase)
    ? { content: reportBase } // Legacy array format
    : { ...reportBase }; // Object format

  // List of all specialized medical sections from multi-node processing
  const specializedSections = [
    "diagnosis",
    "performer",
    "patient",
    "bodyParts",
    "signals",
    "ecg",
    "echo",
    "allergies",
    "anesthesia",
    "microscopic",
    "triage",
    "immunizations",
    "specimens",
    "admission",
    "dental",
    "tumorCharacteristics",
    "treatmentPlan",
    "treatmentResponse",
    "imagingFindings",
    "grossFindings",
    "specialStains",
    "socialHistory",
    "treatments",
    "assessment",
    "molecular",
    "medications",
    "procedures",
    "imaging",
  ];

  // Merge all specialized sections from workflow result into report object
  // Strip any processing metadata that leaked from node result wrappers
  // Pass section key for backward-compat double-nesting unwrap
  for (const section of specializedSections) {
    if (workflowResult[section] !== undefined) {
      reportObject[section] = stripProcessingMetadata(
        workflowResult[section],
        section,
      );
    }
  }

  // Extract signals - prefer the cleaned version from reportObject (already stripped/unwrapped)
  // Fall back to actualContent.signals for legacy format
  let signalsArray = actualContent.signals;
  if (reportObject.signals !== undefined) {
    if (Array.isArray(reportObject.signals)) {
      signalsArray = reportObject.signals;
    } else if (
      reportObject.signals?.signals &&
      Array.isArray(reportObject.signals.signals)
    ) {
      // Handle any remaining double-wrapped case
      signalsArray = reportObject.signals.signals;
    }
  }

  // Merge bodyParts identifications into tags (matching analyzeReport.ts behavior)
  let tags: string[] = actualContent.tags || [];

  if (reportObject.bodyParts && Array.isArray(reportObject.bodyParts)) {
    // Normalize body part identifications to valid 3D object names
    for (const bp of reportObject.bodyParts) {
      if (typeof bp.identification === "string" && bp.identification.length > 0) {
        bp.identification = normalizeBodyPartId(bp.identification);
      }
    }
    const bodyPartTags = reportObject.bodyParts
      .map((bp: any) => bp.identification)
      .filter((id: any) => typeof id === "string" && id.length > 0);
    if (bodyPartTags.length > 0) {
      tags = [...new Set([...tags, ...bodyPartTags])];
    }
  }

  return {
    type: actualContent.type || "report",
    fhirType: actualContent.fhirType || "DiagnosticReport",
    fhir: actualContent.fhir || {},
    category: actualContent.category || "report",
    isMedical:
      actualContent.isMedical !== undefined ? actualContent.isMedical : true,
    tags,
    hasPrescription: actualContent.hasPrescription || false,
    hasImmunization: actualContent.hasImmunization || false,
    // Derive hasLabOrVitals from workflow feature detection or signals presence
    hasLabOrVitals:
      actualContent.hasLabOrVitals ||
      workflowResult.featureDetectionResults?.hasSignals ||
      (signalsArray &&
        (Array.isArray(signalsArray) ? signalsArray.length > 0 : false)) ||
      false,
    content: actualContent.content || fallbackText,
    // Pass through complete report with all specialized sections merged
    report: reportObject,
    text: actualContent.text || fallbackText || "",
    tokenUsage: workflowResult.tokenUsage ||
      actualContent.tokenUsage || { total: 0 },
    results: actualContent.results,
    recommendations: actualContent.recommendations,
    title: actualContent.title,
    summary: actualContent.summary,
    // Keep signals at top level for backward compatibility
    signals: signalsArray,
    // Enhanced fields from workflow
    documentType: actualContent.documentType,
    schemaUsed: actualContent.schemaUsed,
    confidence: actualContent.confidence,
    processingComplexity: actualContent.processingComplexity,
    enhancedFields: actualContent.enhancedFields,
    // Propagate workflow errors so callers can detect failed analysis
    errors: workflowResult.errors?.length > 0 ? workflowResult.errors : undefined,
  } as ReportAnalysis;
}
