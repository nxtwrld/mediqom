import type { FunctionDefinition } from "@langchain/core/language_models/base";
import corePerformer from "./core.performer";

/**
 * Special Stains Schema
 *
 * Extracts special stains and immunohistochemistry results.
 * Reuses core components for consistency.
 */
export default {
  name: "extract_special_stains",
  description:
    "Extract comprehensive special stains and immunohistochemistry results including staining patterns, interpretations, and diagnostic significance.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasSpecialStains: {
        type: "boolean",
        description:
          "Does this document contain special stains or immunohistochemistry results?",
      },

      immunohistochemistry: {
        type: "array",
        description: "Immunohistochemistry stains performed",
        items: {
          type: "object",
          properties: {
            antibody: {
              type: "string",
              description: "Antibody name (e.g., CK7, TTF-1, p53)",
            },
            clone: {
              type: "string",
              description: "Antibody clone if specified",
            },
            result: {
              type: "string",
              enum: [
                "positive",
                "negative",
                "focal_positive",
                "weakly_positive",
                "strongly_positive",
                "equivocal",
              ],
              description: "Overall staining result",
            },
            pattern: {
              type: "object",
              properties: {
                distribution: {
                  type: "string",
                  enum: [
                    "diffuse",
                    "focal",
                    "patchy",
                    "circumferential",
                    "basal",
                    "apical",
                    "membranous",
                    "cytoplasmic",
                    "nuclear",
                  ],
                  description: "Staining distribution pattern",
                },
                intensity: {
                  type: "string",
                  enum: ["weak", "moderate", "strong"],
                  description: "Staining intensity",
                },
                percentage: {
                  type: "string",
                  description:
                    "Percentage of cells staining (e.g., '80%', '10-20%'). ONLY populate if explicitly stated in the document.",
                },
                subcellularLocation: {
                  type: "string",
                  enum: [
                    "nuclear",
                    "cytoplasmic",
                    "membranous",
                    "nuclear_and_cytoplasmic",
                  ],
                  description: "Subcellular staining location",
                },
              },
            },
            controls: {
              type: "object",
              properties: {
                positive: {
                  type: "string",
                  enum: ["adequate", "inadequate", "not_performed"],
                  description: "Positive control result",
                },
                negative: {
                  type: "string",
                  enum: ["adequate", "inadequate", "not_performed"],
                  description: "Negative control result",
                },
              },
            },
            interpretation: {
              type: "string",
              description: "Clinical interpretation of staining result",
            },
            diagnosticSignificance: {
              type: "string",
              description: "Diagnostic significance of the result",
            },
            methodology: {
              type: "object",
              properties: {
                platform: {
                  type: "string",
                  description: "Staining platform used (Ventana, Dako, etc.)",
                },
                protocol: {
                  type: "string",
                  description: "Staining protocol or program",
                },
                dilution: {
                  type: "string",
                  description: "Antibody dilution",
                },
                incubationTime: {
                  type: "string",
                  description: "Incubation time",
                },
              },
            },
          },
          required: ["antibody", "result"],
        },
      },

      histochemicalStains: {
        type: "array",
        description: "Histochemical stains performed",
        items: {
          type: "object",
          properties: {
            stainName: {
              type: "string",
              description: "Stain name (PAS, Trichrome, Congo Red, etc.)",
            },
            purpose: {
              type: "string",
              description:
                "Purpose of staining (collagen, mucin, amyloid, etc.)",
            },
            result: {
              type: "string",
              enum: ["positive", "negative", "focal_positive", "equivocal"],
              description: "Staining result",
            },
            pattern: {
              type: "string",
              description: "Staining pattern description",
            },
            interpretation: {
              type: "string",
              description: "Interpretation of staining result",
            },
            controls: {
              type: "object",
              properties: {
                positive: {
                  type: "string",
                  enum: ["adequate", "inadequate", "not_performed"],
                  description: "Positive control result",
                },
                negative: {
                  type: "string",
                  enum: ["adequate", "inadequate", "not_performed"],
                  description: "Negative control result",
                },
              },
            },
          },
          required: ["stainName", "result"],
        },
      },

      molecularStains: {
        type: "array",
        description: "Molecular/in-situ hybridization studies",
        items: {
          type: "object",
          properties: {
            target: {
              type: "string",
              description: "Molecular target (HER2, EBER, HPV, etc.)",
            },
            method: {
              type: "string",
              enum: ["FISH", "CISH", "SISH", "ISH", "PCR"],
              description: "Molecular method used",
            },
            result: {
              type: "string",
              description: "Result description",
            },
            interpretation: {
              type: "string",
              enum: [
                "positive",
                "negative",
                "amplified",
                "non_amplified",
                "equivocal",
              ],
              description: "Interpretation",
            },
            ratio: {
              type: "string",
              description:
                "Signal ratio if applicable (e.g., HER2/CEP17 ratio)",
            },
            copyNumber: {
              type: "string",
              description: "Copy number if applicable",
            },
            cellsCounted: {
              type: "number",
              description: "Number of cells counted",
            },
            criteria: {
              type: "string",
              description: "Criteria used for interpretation (ASCO/CAP, etc.)",
            },
          },
          required: ["target", "method", "interpretation"],
        },
      },

      proliferationMarkers: {
        type: "array",
        description: "Proliferation markers (Ki-67, MIB-1, etc.)",
        items: {
          type: "object",
          properties: {
            marker: {
              type: "string",
              description: "Proliferation marker name",
            },
            percentage: {
              type: "string",
              description: "Percentage of positive cells. ONLY populate if explicitly stated in the document.",
            },
            interpretation: {
              type: "string",
              enum: ["low", "intermediate", "high"],
              description: "Proliferation index interpretation",
            },
            countingMethod: {
              type: "string",
              description:
                "Method used for counting (manual, digital image analysis)",
            },
            hotspots: {
              type: "boolean",
              description: "Were hotspots analyzed?",
            },
          },
          required: ["marker", "percentage"],
        },
      },

      panelInterpretation: {
        type: "object",
        description: "Overall interpretation of staining panel",
        properties: {
          diagnosticConclusion: {
            type: "string",
            description: "Diagnostic conclusion based on staining pattern",
          },
          differentialDiagnosis: {
            type: "array",
            description: "Differential diagnoses considered",
            items: {
              type: "string",
            },
          },
          additionalStudies: {
            type: "array",
            description: "Additional studies recommended",
            items: {
              type: "string",
            },
          },
        },
      },

      qualityAssessment: {
        type: "object",
        properties: {
          tissueQuality: {
            type: "string",
            enum: ["excellent", "good", "fair", "poor"],
            description: "Overall tissue quality for staining",
          },
          artifactsPresent: {
            type: "boolean",
            description: "Are staining artifacts present?",
          },
          artifactDescription: {
            type: "string",
            description: "Description of staining artifacts if present",
          },
          limitations: {
            type: "array",
            description: "Technical limitations affecting interpretation",
            items: {
              type: "string",
            },
          },
        },
      },

      technicalDetails: {
        type: "object",
        properties: {
          laboratory: {
            type: "string",
            description: "Laboratory performing stains",
          },
          stainDate: {
            type: "string",
            description: "Date stains were performed (ISO format)",
          },
          reportDate: {
            type: "string",
            description: "Date stain results reported (ISO format)",
          },
          sections: {
            type: "array",
            description: "Tissue sections used for staining",
            items: {
              type: "string",
            },
          },
        },
      },

      // Additional performers (primary performer extracted by medical-analysis node)
      // Expected roles: pathologist, pathologist_molecular, lab_technician
      interpretingPathologist: corePerformer,

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in special stains extraction (0-1)",
      },
    },
    required: ["hasSpecialStains"],
  },
} as FunctionDefinition;
