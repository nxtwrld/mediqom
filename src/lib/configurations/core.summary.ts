import coreDiagnosis from "./core.diagnosis";
import coreBodyParts from "./core.bodyParts";
import corePerformer from "./core.performer";
import coreSignals from "./core.signals";

/**
 * Core Summary Schema
 *
 * Extracts document summaries, key findings, and clinical impressions.
 * Directly embeds core schemas for proper data structure consistency.
 */
export default {
  name: "extract_medical_summary",
  description:
    "Extract the summary, key findings, clinical impressions, and main conclusions from the medical document. Focus on the primary findings and overall assessment.",
  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "The main summary or abstract of the document. Include key findings, primary conclusions, and overall clinical impression. Translate to [LANGUAGE] if source is in different language.",
      },
      findings: {
        type: "array",
        description: "List of key findings or observations from the document",
        items: {
          type: "object",
          properties: {
            finding: {
              type: "string",
              description:
                "Description of the finding. Translate to [LANGUAGE] if needed.",
            },
            significance: {
              type: "string",
              enum: ["critical", "significant", "moderate", "minor", "normal"],
              description: "Clinical significance of the finding",
            },
            bodyPartId: {
              type: "string",
              description:
                "ID of affected body part from core.bodyParts if applicable",
            },
            diagnosisCode: {
              type: "string",
              description:
                "Related ICD-10 code from core.diagnosis if applicable",
            },
            urgency: {
              type: "number",
              description:
                "Urgency level (1-5) matching core.bodyParts urgency scale",
              minimum: 1,
              maximum: 5,
            },
          },
          required: ["finding", "significance"],
        },
      },
      clinicalImpression: {
        type: "string",
        description:
          "The overall clinical impression or interpretation. Translate to [LANGUAGE] if needed.",
      },
      // Directly embed core.diagnosis schema
      primaryDiagnosis: coreDiagnosis,
      // Directly embed core.bodyParts schema for affected areas
      affectedBodyParts: coreBodyParts,
      // Directly embed core.performer schema for report author
      reportAuthor: corePerformer,
      // Directly embed core.signals schema for related measurements
      relatedMeasurements: coreSignals,
      reportDate: {
        type: "string",
        description: "Date of the report in ISO format (YYYY-MM-DD)",
      },
      reportType: {
        type: "string",
        description: "Type of medical report",
        enum: [
          "radiology_report",
          "pathology_report",
          "consultation_note",
          "discharge_summary",
          "operative_report",
          "progress_note",
          "emergency_report",
          "laboratory_report",
        ],
      },
    },
    required: ["summary"],
  },
};
