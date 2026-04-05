import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreDiagnosis from "./core.diagnosis";
import coreBodyParts from "./core.bodyParts";

/**
 * Microscopic Examination Schema
 *
 * Extracts microscopic/histological examination findings from pathology reports.
 * Directly embeds core schemas for proper data structure consistency.
 */
export default {
  name: "extract_microscopic_findings",
  description:
    "Extract all microscopic examination, histological findings, and cellular descriptions from pathology reports.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasMicroscopic: {
        type: "boolean",
        description:
          "Does this document contain microscopic examination findings?",
      },
      microscopicFindings: {
        type: "array",
        description: "List of microscopic findings by specimen or section",
        items: {
          type: "object",
          properties: {
            specimenId: {
              type: "string",
              description:
                "Reference to specimen ID (e.g., 'A', 'B', 'S21-12345')",
            },
            sectionId: {
              type: "string",
              description: "Section identifier if multiple sections examined",
            },
            histologicalType: {
              type: "string",
              description: "Histological type or pattern observed",
            },
            cellularDescription: {
              type: "string",
              description:
                "Description of cellular morphology and architecture. Translate to [LANGUAGE] if needed.",
            },
            grade: {
              type: "object",
              properties: {
                system: {
                  type: "string",
                  description:
                    "Grading system used (e.g., Gleason, WHO, Nottingham)",
                },
                score: {
                  type: "string",
                  description: "Grade score or category. ONLY populate if explicitly stated in the document.",
                },
                components: {
                  type: "array",
                  description: "Component scores if applicable. ONLY populate if explicitly stated in the document.",
                  items: {
                    type: "string",
                  },
                },
              },
            },
            margins: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  enum: [
                    "negative",
                    "positive",
                    "close",
                    "not_evaluated",
                    "see_comment",
                  ],
                  description: "Margin status",
                },
                distance: {
                  type: "string",
                  description: "Distance to nearest margin (e.g., '2 mm')",
                },
                involvedMargins: {
                  type: "array",
                  description: "Which margins are involved if positive",
                  items: {
                    type: "string",
                  },
                },
              },
            },
            invasion: {
              type: "object",
              properties: {
                lymphovascular: {
                  type: "string",
                  enum: ["present", "absent", "indeterminate", "not_evaluated"],
                  description: "Lymphovascular invasion status",
                },
                perineural: {
                  type: "string",
                  enum: ["present", "absent", "indeterminate", "not_evaluated"],
                  description: "Perineural invasion status",
                },
                depth: {
                  type: "string",
                  description: "Depth of invasion (e.g., 'submucosa', '5 mm')",
                },
              },
            },
            mitoses: {
              type: "object",
              properties: {
                count: {
                  type: "number",
                  description: "Mitotic count. ONLY populate if explicitly stated in the document.",
                },
                per: {
                  type: "string",
                  description: "Measurement unit (e.g., '10 HPF', 'mm²')",
                },
                activity: {
                  type: "string",
                  enum: ["low", "moderate", "high", "very_high"],
                  description: "Mitotic activity level",
                },
              },
            },
            necrosis: {
              type: "object",
              properties: {
                present: {
                  type: "boolean",
                  description: "Is necrosis present?",
                },
                percentage: {
                  type: "number",
                  description: "Percentage of necrosis if quantified. ONLY populate if explicitly stated in the document.",
                },
                type: {
                  type: "string",
                  description:
                    "Type of necrosis (e.g., coagulative, geographic)",
                },
              },
            },
            inflammation: {
              type: "object",
              properties: {
                degree: {
                  type: "string",
                  enum: ["none", "minimal", "mild", "moderate", "severe"],
                  description: "Degree of inflammation",
                },
                type: {
                  type: "string",
                  description:
                    "Type of inflammation (e.g., acute, chronic, granulomatous)",
                },
                pattern: {
                  type: "string",
                  description: "Inflammatory pattern",
                },
              },
            },
            specialFindings: {
              type: "array",
              description: "Special microscopic findings",
              items: {
                type: "string",
              },
            },
            // Directly embed core.bodyParts for affected structures
            affectedStructures: coreBodyParts,
          },
          required: ["specimenId", "cellularDescription"],
        },
      },
      overallMicroscopicImpression: {
        type: "string",
        description:
          "Overall microscopic impression or summary. Translate result to the [LANGUAGE] language if the source is in a different language.",
      },
      // Directly embed core.diagnosis schema
      microscopicDiagnosis: coreDiagnosis,
      differentialDiagnosis: {
        type: "array",
        description:
          "Differential diagnoses considered based on microscopic findings",
        items: coreDiagnosis,
      },
      correlationWithClinical: {
        type: "string",
        description:
          "Correlation between microscopic findings and clinical history. Translate result to the [LANGUAGE] language if the source is in a different language.",
      },
      additionalStudiesRecommended: {
        type: "array",
        description:
          "Additional studies recommended based on microscopic findings",
        items: {
          type: "object",
          properties: {
            study: {
              type: "string",
              description:
                "Type of study (e.g., immunohistochemistry, molecular testing)",
            },
            reason: {
              type: "string",
              description: "Reason for recommendation",
            },
            markers: {
              type: "array",
              description: "Specific markers or tests if applicable",
              items: {
                type: "string",
              },
            },
          },
        },
      },
    },
    required: ["hasMicroscopic"],
  },
} as FunctionDefinition;
