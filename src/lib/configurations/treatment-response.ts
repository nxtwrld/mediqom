import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreSignals from "./core.signals";
import coreDiagnosis from "./core.diagnosis";
import corePerformer from "./core.performer";
import coreBodyParts from "./core.bodyParts";

/**
 * Treatment Response Schema
 *
 * Extracts treatment response assessment including RECIST criteria.
 * Reuses core components for consistency.
 */
export default {
  name: "extract_treatment_response",
  description:
    "Extract comprehensive treatment response assessment including RECIST criteria, tumor measurements, and clinical response evaluation.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasTreatmentResponse: {
        type: "boolean",
        description:
          "Does this document contain treatment response assessment?",
      },

      assessmentDate: {
        type: "string",
        description: "Date of response assessment (ISO format)",
      },

      // Reuse core.diagnosis for treated diagnosis
      treatedDiagnosis: coreDiagnosis,

      recistAssessment: {
        type: "object",
        description:
          "RECIST (Response Evaluation Criteria in Solid Tumors) assessment",
        properties: {
          version: {
            type: "string",
            enum: ["RECIST 1.0", "RECIST 1.1", "iRECIST"],
            description: "RECIST version used",
          },
          overallResponse: {
            type: "string",
            enum: ["CR", "PR", "SD", "PD", "NE"],
            description:
              "Overall response: Complete Response, Partial Response, Stable Disease, Progressive Disease, Not Evaluable",
          },
          targetLesions: {
            type: "array",
            description: "Target lesion measurements",
            items: {
              type: "object",
              properties: {
                lesionId: {
                  type: "string",
                  description: "Lesion identifier",
                },
                location: {
                  type: "string",
                  description: "Anatomical location",
                },
                // Reuse core.bodyParts for lesion location
                bodyPart: coreBodyParts,
                baseline: {
                  type: "object",
                  properties: {
                    measurement: {
                      type: "string",
                      description: "Baseline measurement (mm or cm). ONLY populate if explicitly stated in the document.",
                    },
                    date: {
                      type: "string",
                      description: "Baseline measurement date",
                    },
                  },
                },
                current: {
                  type: "object",
                  properties: {
                    measurement: {
                      type: "string",
                      description: "Current measurement (mm or cm). ONLY populate if explicitly stated in the document.",
                    },
                    percentChange: {
                      type: "number",
                      description: "Percent change from baseline. ONLY populate if explicitly stated in the document.",
                    },
                  },
                },
                response: {
                  type: "string",
                  enum: [
                    "disappeared",
                    "decreased",
                    "stable",
                    "increased",
                    "new",
                  ],
                  description: "Individual lesion response",
                },
              },
              required: ["lesionId", "location"],
            },
          },
          nonTargetLesions: {
            type: "array",
            description: "Non-target lesion assessment",
            items: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description: "Anatomical location",
                },
                response: {
                  type: "string",
                  enum: ["disappeared", "stable", "increased", "new"],
                  description: "Non-target lesion response",
                },
              },
            },
          },
          newLesions: {
            type: "boolean",
            description: "Are new lesions present?",
          },
          sumOfDiameters: {
            type: "object",
            properties: {
              baseline: {
                type: "number",
                description: "Baseline sum of target lesion diameters (mm). ONLY populate if explicitly stated in the document.",
              },
              current: {
                type: "number",
                description: "Current sum of target lesion diameters (mm). ONLY populate if explicitly stated in the document.",
              },
              percentChange: {
                type: "number",
                description: "Percent change from baseline. ONLY populate if explicitly stated in the document.",
              },
            },
          },
        },
      },

      clinicalResponse: {
        type: "object",
        description: "Clinical response assessment",
        properties: {
          symptoms: {
            type: "object",
            properties: {
              baseline: {
                type: "array",
                description: "Baseline symptoms",
                items: {
                  type: "string",
                },
              },
              current: {
                type: "array",
                description: "Current symptoms",
                items: {
                  type: "string",
                },
              },
              improvement: {
                type: "string",
                enum: [
                  "significant_improvement",
                  "improvement",
                  "stable",
                  "worsening",
                ],
                description: "Symptom improvement assessment",
              },
            },
          },
          performanceStatus: {
            type: "object",
            properties: {
              baseline: {
                type: "object",
                properties: {
                  ecog: {
                    type: "number",
                    minimum: 0,
                    maximum: 5,
                    description: "Baseline ECOG performance status. ONLY populate if explicitly stated in the document.",
                  },
                  karnofsky: {
                    type: "number",
                    minimum: 0,
                    maximum: 100,
                    description: "Baseline Karnofsky performance status. ONLY populate if explicitly stated in the document.",
                  },
                },
              },
              current: {
                type: "object",
                properties: {
                  ecog: {
                    type: "number",
                    minimum: 0,
                    maximum: 5,
                    description: "Current ECOG performance status. ONLY populate if explicitly stated in the document.",
                  },
                  karnofsky: {
                    type: "number",
                    minimum: 0,
                    maximum: 100,
                    description: "Current Karnofsky performance status. ONLY populate if explicitly stated in the document.",
                  },
                },
              },
            },
          },
          qualityOfLife: {
            type: "string",
            enum: ["improved", "stable", "declined"],
            description: "Quality of life assessment",
          },
        },
      },

      // Reuse core.signals for lab values and biomarkers
      biomarkerResponse: {
        type: "object",
        description: "Biomarker response assessment",
        properties: {
          tumorMarkers: coreSignals,
          biochemicalResponse: {
            type: "string",
            enum: ["complete", "partial", "stable", "progression"],
            description: "Biochemical response category",
          },
        },
      },

      radiologicResponse: {
        type: "object",
        description: "Radiologic response details",
        properties: {
          imagingModality: {
            type: "string",
            description: "Imaging modality used (CT, MRI, PET, etc.)",
          },
          findings: {
            type: "array",
            description: "Key radiologic findings",
            items: {
              type: "string",
            },
          },
          comparison: {
            type: "string",
            description: "Comparison to prior imaging",
          },
        },
      },

      treatmentToxicity: {
        type: "array",
        description: "Treatment-related toxicities",
        items: {
          type: "object",
          properties: {
            toxicity: {
              type: "string",
              description: "Toxicity type",
            },
            grade: {
              type: "string",
              enum: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"],
              description: "CTCAE toxicity grade",
            },
            attribution: {
              type: "string",
              enum: [
                "definite",
                "probable",
                "possible",
                "unlikely",
                "unrelated",
              ],
              description: "Attribution to treatment",
            },
            action: {
              type: "string",
              description:
                "Action taken (dose reduction, delay, discontinuation)",
            },
          },
        },
      },

      responseDate: {
        type: "string",
        description: "Date response was achieved (ISO format)",
      },

      durationOfResponse: {
        type: "string",
        description: "Duration of response if applicable",
      },

      progressionDate: {
        type: "string",
        description: "Date of progression if applicable (ISO format)",
      },

      timeToProgression: {
        type: "string",
        description: "Time to progression if applicable",
      },

      nextAssessment: {
        type: "object",
        properties: {
          plannedDate: {
            type: "string",
            description: "Next planned assessment date (ISO format)",
          },
          modality: {
            type: "string",
            description: "Planned assessment modality",
          },
        },
      },

      // Additional performers (primary performer extracted by medical-analysis node)
      // Expected roles: oncologist, oncologist_medical, oncologist_radiation, radiologist
      assessingOncologist: corePerformer,

      clinicalTrialContext: {
        type: "object",
        description: "Clinical trial context if applicable",
        properties: {
          studyId: {
            type: "string",
            description: "Clinical trial identifier",
          },
          assessmentSchedule: {
            type: "string",
            description: "Protocol-defined assessment schedule",
          },
        },
      },

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in treatment response extraction (0-1)",
      },
    },
    required: ["hasTreatmentResponse"],
  },
} as FunctionDefinition;
