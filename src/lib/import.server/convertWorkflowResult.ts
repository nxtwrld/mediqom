import type { ReportAnalysis } from "$lib/import/types";

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
      category: workflowResult.report?.category || "report",
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

  // Merge bodyParts identifications into tags (matching analyzeReport.ts behavior)
  const report = useStructuredData ? workflowResult.report : actualContent.report;
  let tags: string[] = actualContent.tags || [];
  if (report && !Array.isArray(report) && report.bodyParts && Array.isArray(report.bodyParts)) {
    const bodyPartTags = report.bodyParts
      .map((bp: any) => bp.identification)
      .filter((id: any) => typeof id === 'string' && id.length > 0);
    if (bodyPartTags.length > 0) {
      tags = [...new Set([...tags, ...bodyPartTags])];
    }
  }

  return {
    type: actualContent.type || "report",
    fhirType: actualContent.fhirType || "DiagnosticReport",
    fhir: actualContent.fhir || {},
    cagegory: actualContent.category || "report",
    isMedical:
      actualContent.isMedical !== undefined ? actualContent.isMedical : true,
    tags,
    hasPrescription: actualContent.hasPrescription || false,
    hasImmunization: actualContent.hasImmunization || false,
    hasLabOrVitals: actualContent.hasLabOrVitals || false,
    content: actualContent.content || fallbackText,
    report: useStructuredData
      ? workflowResult.report
      : actualContent.report || [
          { type: "text", text: actualContent.text || fallbackText },
        ],
    text: actualContent.text || fallbackText || "",
    tokenUsage: workflowResult.tokenUsage ||
      actualContent.tokenUsage || { total: 0 },
    results: actualContent.results,
    recommendations: actualContent.recommendations,
    title: actualContent.title,
    summary: actualContent.summary,
    signals: actualContent.signals,
    // Enhanced fields from workflow
    documentType: actualContent.documentType,
    schemaUsed: actualContent.schemaUsed,
    confidence: actualContent.confidence,
    processingComplexity: actualContent.processingComplexity,
    enhancedFields: actualContent.enhancedFields,
  } as ReportAnalysis;
}
