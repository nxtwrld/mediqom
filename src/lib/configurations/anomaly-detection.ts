import type { FunctionDefinition } from "@langchain/core/language_models/base";

export default {
  name: "anomaly_detection",
  description: `
You are detecting abnormalities and pathological findings in a medical image.

Focus on identifying:
1. Masses, lesions, or tumors
2. Fractures or bone abnormalities  
3. Foreign objects
4. Inflammation or infection signs
5. Structural deformities
6. Fluid accumulations
7. Calcifications
8. Any other pathological findings

For each finding, describe its location, characteristics, and potential significance.

CRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.
`,
  parameters: {
    type: "object",
    properties: {
      anomalies: {
        type: "array",
        description: "List of detected abnormalities",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "mass",
                "lesion",
                "tumor",
                "fracture",
                "foreign_object",
                "inflammation",
                "infection",
                "deformity",
                "fluid_accumulation",
                "calcification",
                "hemorrhage",
                "pneumothorax",
                "consolidation",
                "atelectasis",
                "other",
              ],
              description: "Category of abnormality",
            },
            description: {
              type: "string",
              description: "Detailed description of the abnormality",
            },
            location: {
              type: "string",
              description: "Anatomical location of the finding",
            },
            size: {
              type: "string",
              description:
                "Size description if visible (e.g., 'small', '2cm', 'diffuse')",
            },
            characteristics: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Visual characteristics (e.g., 'well-defined', 'irregular', 'hyperdense')",
            },
            severity: {
              type: "string",
              enum: ["critical", "severe", "moderate", "mild", "minimal"],
              description: "Severity assessment",
            },
            confidence: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Confidence in this finding (0-1)",
            },
          },
          required: [
            "type",
            "description",
            "location",
            "severity",
            "confidence",
          ],
        },
      },

      normalFindings: {
        type: "array",
        items: {
          type: "string",
        },
        description: "List of structures that appear normal",
      },

      overallAssessment: {
        type: "string",
        enum: [
          "normal",
          "abnormal_minor",
          "abnormal_moderate",
          "abnormal_significant",
          "abnormal_critical",
        ],
        description: "Overall assessment of findings",
      },

      urgentFindings: {
        type: "boolean",
        description: "Whether any findings require urgent attention",
      },

      differentialConsiderations: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "Possible differential diagnoses to consider (if applicable)",
      },
    },
    required: [
      "anomalies",
      "normalFindings",
      "overallAssessment",
      "urgentFindings",
    ],
  },
} as FunctionDefinition;
