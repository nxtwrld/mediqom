import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreBodyParts from "./core.bodyParts";
import coreDiagnosis from "./core.diagnosis";
import corePerformer from "./core.performer";

/**
 * Gross Findings Schema
 *
 * Extracts gross pathological examination findings.
 * Reuses core components for consistency.
 */
export default {
  name: "extract_gross_findings",
  description:
    "Extract comprehensive gross pathological examination findings including specimen descriptions, measurements, and macroscopic observations.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasGrossFindings: {
        type: "boolean",
        description:
          "Does this document contain gross pathological examination findings?",
      },

      specimens: {
        type: "array",
        description: "Specimens examined",
        items: {
          type: "object",
          properties: {
            specimenId: {
              type: "string",
              description: "Specimen identifier or label",
            },
            description: {
              type: "string",
              description: "Overall specimen description",
            },
            // Reuse core.bodyParts for specimen source
            sourceBodyPart: coreBodyParts,
            procedure: {
              type: "string",
              description:
                "Procedure used to obtain specimen (biopsy, resection, etc.)",
            },
            receivedDate: {
              type: "string",
              description: "Date specimen received (ISO format)",
            },
            dimensions: {
              type: "object",
              properties: {
                overall: {
                  type: "string",
                  description:
                    "Overall specimen dimensions (e.g., '12.5 x 8.0 x 3.2 cm')",
                },
                weight: {
                  type: "string",
                  description: "Specimen weight if recorded",
                },
              },
            },
            orientation: {
              type: "string",
              description: "Specimen orientation and landmarks",
            },
            containers: {
              type: "array",
              description: "Individual containers or parts",
              items: {
                type: "object",
                properties: {
                  containerId: {
                    type: "string",
                    description: "Container identifier",
                  },
                  contents: {
                    type: "string",
                    description: "Container contents description",
                  },
                  fixative: {
                    type: "string",
                    description: "Fixative used (formalin, etc.)",
                  },
                },
              },
            },
          },
          required: ["specimenId", "description"],
        },
      },

      macroscopicFindings: {
        type: "array",
        description: "Detailed macroscopic findings",
        items: {
          type: "object",
          properties: {
            structure: {
              type: "string",
              description:
                "Anatomical structure examined. Use standardized terminology from the [LANGUAGE] localization set.",
            },
            appearance: {
              type: "object",
              properties: {
                color: {
                  type: "string",
                  description: "Color description",
                },
                texture: {
                  type: "string",
                  description:
                    "Texture description (smooth, rough, granular, etc.)",
                },
                consistency: {
                  type: "string",
                  description: "Consistency (soft, firm, hard, etc.)",
                },
                surface: {
                  type: "string",
                  description: "Surface characteristics",
                },
              },
            },
            lesions: {
              type: "array",
              description: "Identified lesions or abnormalities",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    description: "Lesion type (tumor, cyst, nodule, etc.)",
                  },
                  location: {
                    type: "string",
                    description: "Specific location within specimen",
                  },
                  size: {
                    type: "string",
                    description: "Lesion dimensions. ONLY populate if explicitly stated in the document.",
                  },
                  color: {
                    type: "string",
                    description: "Lesion color",
                  },
                  consistency: {
                    type: "string",
                    description:
                      "Lesion consistency. Use standardized terminology from the [LANGUAGE] localization set.",
                  },
                  margins: {
                    type: "string",
                    description: "Lesion margin characteristics",
                  },
                  relationship: {
                    type: "string",
                    description:
                      "Relationship to surrounding structures. Translate result to the [LANGUAGE] language if the source is in a different language.",
                  },
                },
                required: ["type", "size"],
              },
            },
            margins: {
              type: "object",
              description: "Surgical margin assessment",
              properties: {
                closest: {
                  type: "string",
                  description: "Distance to closest margin",
                },
                anterior: {
                  type: "string",
                  description:
                    "Anterior margin distance. Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
                posterior: {
                  type: "string",
                  description: "Posterior margin distance",
                },
                superior: {
                  type: "string",
                  description: "Superior margin distance",
                },
                inferior: {
                  type: "string",
                  description: "Inferior margin distance",
                },
                lateral: {
                  type: "string",
                  description: "Lateral margin distance",
                },
                medial: {
                  type: "string",
                  description: "Medial margin distance",
                },
                circumferential: {
                  type: "string",
                  description: "Circumferential margin assessment",
                },
              },
            },
          },
        },
      },

      lymphNodes: {
        type: "object",
        description: "Lymph node examination",
        properties: {
          identified: {
            type: "boolean",
            description: "Were lymph nodes identified?",
          },
          count: {
            type: "number",
            description: "Number of lymph nodes identified. ONLY populate if explicitly stated in the document.",
          },
          locations: {
            type: "array",
            description: "Lymph node locations",
            items: {
              type: "string",
            },
          },
          size: {
            type: "object",
            properties: {
              largest: {
                type: "string",
                description: "Size of largest lymph node. ONLY populate if explicitly stated in the document.",
              },
              range: {
                type: "string",
                description: "Size range of lymph nodes. ONLY populate if explicitly stated in the document.",
              },
            },
          },
          appearance: {
            type: "string",
            description:
              "Gross appearance of lymph nodes. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
        },
      },

      sectioning: {
        type: "object",
        description: "Sectioning and sampling information",
        properties: {
          technique: {
            type: "string",
            description: "Sectioning technique used",
          },
          sections: {
            type: "array",
            description: "Sections taken for microscopy",
            items: {
              type: "object",
              properties: {
                sectionId: {
                  type: "string",
                  description: "Section identifier (A1, B2, etc.)",
                },
                source: {
                  type: "string",
                  description:
                    "Source within specimen. Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
                purpose: {
                  type: "string",
                  description:
                    "Purpose of section. Use standardized terminology from the [LANGUAGE] localization set.",
                },
                staining: {
                  type: "array",
                  description: "Planned staining methods",
                  items: {
                    type: "string",
                  },
                },
              },
            },
          },
          representativeSections: {
            type: "string",
            description:
              "Description of representative sections taken. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
        },
      },

      additionalObservations: {
        type: "array",
        description: "Additional gross observations",
        items: {
          type: "string",
          description:
            "Additional observation. Translate result to the [LANGUAGE] language if the source is in a different language.",
        },
      },

      // Reuse core.diagnosis for preliminary gross diagnosis
      preliminaryDiagnosis: coreDiagnosis,

      // Additional performers (primary performer extracted by medical-analysis node)
      // Expected roles: pathologist, pathologist_forensic, resident_physician, fellow
      examiningPathologist: corePerformer,

      examinationDate: {
        type: "string",
        description: "Date of gross examination (ISO format)",
      },

      photographicDocumentation: {
        type: "object",
        properties: {
          performed: {
            type: "boolean",
            description: "Was photographic documentation performed?",
          },
          imageIds: {
            type: "array",
            description: "Image identifiers if available",
            items: {
              type: "string",
            },
          },
        },
      },

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in gross findings extraction (0-1)",
      },
    },
    required: ["hasGrossFindings"],
  },
} as FunctionDefinition;
