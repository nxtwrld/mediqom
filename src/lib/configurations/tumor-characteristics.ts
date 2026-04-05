import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreBodyParts from "./core.bodyParts";
import coreDiagnosis from "./core.diagnosis";
import corePerformer from "./core.performer";

/**
 * Tumor Characteristics Schema
 *
 * Extracts tumor staging, grading, and cancer characteristics.
 * Reuses core components for consistency.
 */
export default {
  name: "extract_tumor_characteristics",
  description:
    "Extract comprehensive tumor staging, grading, and cancer characteristics from oncology reports and pathology documents.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasTumorCharacteristics: {
        type: "boolean",
        description:
          "Does this document contain tumor staging, grading, or cancer characteristics?",
      },
      primaryTumor: {
        type: "object",
        description: "Primary tumor characteristics",
        properties: {
          site: {
            type: "string",
            description: "Primary tumor site/location",
          },
          // Reuse core.bodyParts for affected body parts
          affectedBodyParts: coreBodyParts,
          size: {
            type: "object",
            properties: {
              dimensions: {
                type: "string",
                description: "Tumor dimensions (e.g., '3.5 x 2.1 x 1.8 cm')",
              },
              volume: {
                type: "string",
                description: "Tumor volume if calculated",
              },
            },
          },
          histology: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description:
                  "Histological type (e.g., adenocarcinoma, squamous cell)",
              },
              grade: {
                type: "string",
                enum: ["G1", "G2", "G3", "G4", "GX"],
                description: "Histological grade",
              },
              differentiation: {
                type: "string",
                enum: [
                  "well_differentiated",
                  "moderately_differentiated",
                  "poorly_differentiated",
                  "undifferentiated",
                ],
                description: "Tumor differentiation",
              },
            },
          },
        },
      },
      staging: {
        type: "object",
        description: "Cancer staging information",
        properties: {
          tnmStaging: {
            type: "object",
            description: "TNM staging system",
            properties: {
              t: {
                type: "string",
                description: "T stage (primary tumor)",
              },
              n: {
                type: "string",
                description: "N stage (lymph nodes)",
              },
              m: {
                type: "string",
                description: "M stage (metastasis)",
              },
              stage: {
                type: "string",
                enum: [
                  "0",
                  "I",
                  "IA",
                  "IB",
                  "II",
                  "IIA",
                  "IIB",
                  "III",
                  "IIIA",
                  "IIIB",
                  "IIIC",
                  "IV",
                  "IVA",
                  "IVB",
                ],
                description: "Overall stage group",
              },
            },
          },
          otherStagingSystems: {
            type: "array",
            description: "Other staging systems used",
            items: {
              type: "object",
              properties: {
                system: {
                  type: "string",
                  description: "Name of staging system",
                },
                stage: {
                  type: "string",
                  description: "Stage according to this system",
                },
              },
            },
          },
        },
      },
      biomarkers: {
        type: "array",
        description: "Tumor biomarkers and molecular characteristics",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Biomarker name (e.g., HER2, ER, PR, PD-L1)",
            },
            result: {
              type: "string",
              description: "Biomarker result (positive/negative/percentage)",
            },
            method: {
              type: "string",
              description: "Testing method used",
            },
            significance: {
              type: "string",
              description: "Clinical significance or interpretation",
            },
          },
          required: ["name", "result"],
        },
      },
      metastases: {
        type: "array",
        description: "Metastatic sites if present",
        items: {
          type: "object",
          properties: {
            site: {
              type: "string",
              description: "Metastatic site",
            },
            // Reuse core.bodyParts for metastatic body parts
            affectedBodyParts: coreBodyParts,
            size: {
              type: "string",
              description: "Size of metastatic lesion",
            },
            number: {
              type: "string",
              description: "Number of lesions",
            },
          },
        },
      },
      prognosticFactors: {
        type: "array",
        description: "Prognostic and predictive factors",
        items: {
          type: "object",
          properties: {
            factor: {
              type: "string",
              description: "Prognostic factor name",
            },
            value: {
              type: "string",
              description: "Factor value or result",
            },
            interpretation: {
              type: "string",
              description: "Clinical interpretation",
            },
          },
        },
      },
      // Reuse core.diagnosis for related diagnoses
      relatedDiagnoses: {
        type: "array",
        items: coreDiagnosis,
        description: "Related cancer diagnoses",
      },
      // Additional performers (primary performer extracted by medical-analysis node)
      // Expected roles: pathologist, pathologist_molecular, pathologist_forensic
      reportingPathologist: corePerformer,

      // Expected roles: oncologist, oncologist_medical, oncologist_radiation, oncologist_surgical
      consultingOncologist: corePerformer,
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in tumor characteristic extraction (0-1)",
      },
    },
    required: ["hasTumorCharacteristics"],
  },
} as FunctionDefinition;
