import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreBodyParts from "./core.bodyParts";
import corePerformer from "./core.performer";
import coreDiagnosis from "./core.diagnosis";

/**
 * Imaging Findings Schema
 *
 * Extracts detailed radiology findings from imaging studies including
 * X-rays, CT, MRI, ultrasound, nuclear medicine, and other imaging modalities.
 * Directly embeds core schemas for proper data structure consistency.
 */
export default {
  name: "extract_imaging_findings_information",
  description:
    "Extract detailed imaging findings, measurements, observations, and radiological interpretations from medical imaging reports including X-ray, CT, MRI, ultrasound, nuclear medicine, and other studies.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasImagingFindings: {
        type: "boolean",
        description: "Does this document contain detailed imaging findings?",
      },
      studyDateTime: {
        type: "string",
        description: "Date and time of imaging study (ISO format)",
      },
      studyType: {
        type: "string",
        enum: [
          "x_ray",
          "ct_scan",
          "mri",
          "ultrasound",
          "nuclear_medicine",
          "pet_scan",
          "pet_ct",
          "mammography",
          "dexa_scan",
          "fluoroscopy",
          "angiography",
          "interventional",
          "other",
        ],
        description: "Type of imaging study performed",
      },
      studyProtocol: {
        type: "string",
        description: "Specific imaging protocol or technique used",
      },
      // Directly embed core.bodyParts for anatomical regions studied
      anatomicalRegions: {
        type: "array",
        description: "Anatomical regions/body parts examined",
        items: coreBodyParts,
      },
      contrast: {
        type: "object",
        properties: {
          used: {
            type: "boolean",
            description: "Was contrast material used?",
          },
          type: {
            type: "string",
            enum: ["iodinated", "gadolinium", "barium", "air", "other"],
            description: "Type of contrast material",
          },
          route: {
            type: "string",
            enum: [
              "intravenous",
              "oral",
              "rectal",
              "intra_articular",
              "intrathecal",
              "other",
            ],
            description: "Route of contrast administration",
          },
          volume: {
            type: "string",
            description: "Volume of contrast administered",
          },
          reaction: {
            type: "string",
            description: "Any contrast reaction observed",
          },
        },
      },
      technicalQuality: {
        type: "object",
        properties: {
          quality: {
            type: "string",
            enum: [
              "excellent",
              "good",
              "adequate",
              "suboptimal",
              "poor",
              "non_diagnostic",
            ],
            description: "Overall technical quality of study",
          },
          limitations: {
            type: "array",
            description: "Technical limitations affecting study",
            items: {
              type: "string",
            },
          },
          artifacts: {
            type: "array",
            description: "Imaging artifacts present",
            items: {
              type: "string",
              enum: [
                "motion_artifact",
                "metal_artifact",
                "beam_hardening",
                "susceptibility_artifact",
                "partial_volume",
                "breathing_artifact",
                "other",
              ],
            },
          },
        },
      },
      findings: {
        type: "array",
        description:
          "Detailed imaging findings organized by anatomical system or region",
        items: {
          type: "object",
          properties: {
            region: {
              type: "string",
              description: "Anatomical region or system",
            },
            organ: {
              type: "string",
              description: "Specific organ or structure",
            },
            finding: {
              type: "string",
              description: "Detailed description of finding. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            location: {
              type: "string",
              description: "Specific anatomical location within organ/region. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            characteristics: {
              type: "object",
              properties: {
                size: {
                  type: "string",
                  description: "Size measurements (include units). ONLY populate if explicitly stated in the document.",
                },
                shape: {
                  type: "string",
                  description: "Shape or morphology",
                },
                density: {
                  type: "string",
                  description: "Density/attenuation characteristics",
                },
                intensity: {
                  type: "string",
                  description: "Signal intensity on MRI",
                },
                echogenicity: {
                  type: "string",
                  description: "Echogenicity on ultrasound",
                },
                enhancement: {
                  type: "string",
                  description: "Contrast enhancement pattern",
                },
                margins: {
                  type: "string",
                  enum: [
                    "well_defined",
                    "ill_defined",
                    "irregular",
                    "smooth",
                    "lobulated",
                  ],
                  description: "Margin characteristics",
                },
              },
            },
            measurements: {
              type: "array",
              description: "Specific measurements",
              items: {
                type: "object",
                properties: {
                  parameter: {
                    type: "string",
                    description: "What was measured",
                  },
                  value: {
                    type: "number",
                    description: "Numerical value. ONLY populate if explicitly stated in the document.",
                  },
                  unit: {
                    type: "string",
                    description: "Unit of measurement",
                  },
                  method: {
                    type: "string",
                    description: "Measurement method or plane",
                  },
                },
              },
            },
            significance: {
              type: "string",
              enum: [
                "normal",
                "incidental",
                "clinically_significant",
                "urgent",
                "critical",
              ],
              description: "Clinical significance of finding",
            },
            changeFromPrior: {
              type: "string",
              enum: [
                "new",
                "stable",
                "improved",
                "worse",
                "resolved",
                "not_compared",
              ],
              description: "Change compared to prior imaging",
            },
            likelyDifferential: {
              type: "array",
              description: "Most likely differential diagnoses",
              items: {
                type: "string",
              },
            },
          },
        },
      },
      measurements: {
        type: "array",
        description: "Important measurements and quantitative assessments",
        items: {
          type: "object",
          properties: {
            structure: {
              type: "string",
              description: "Anatomical structure measured",
            },
            parameter: {
              type: "string",
              description: "Parameter measured (e.g., diameter, volume, area)",
            },
            value: {
              type: "number",
              description: "Measurement value. ONLY populate if explicitly stated in the document.",
            },
            unit: {
              type: "string",
              description: "Unit of measurement",
            },
            normalRange: {
              type: "string",
              description: "Normal reference range if applicable",
            },
            abnormal: {
              type: "boolean",
              description: "Is this measurement abnormal?",
            },
          },
        },
      },
      comparison: {
        type: "object",
        properties: {
          priorStudyDate: {
            type: "string",
            description: "Date of prior comparable study",
          },
          priorStudyType: {
            type: "string",
            description: "Type of prior study",
          },
          interval: {
            type: "string",
            description: "Time interval since prior study",
          },
          overallChange: {
            type: "string",
            enum: ["improved", "stable", "worse", "mixed", "not_comparable"],
            description: "Overall change assessment",
          },
          specificChanges: {
            type: "array",
            description: "Specific changes noted",
            items: {
              type: "string",
            },
          },
        },
      },
      emergentFindings: {
        type: "array",
        description:
          "Urgent or emergent findings requiring immediate attention",
        items: {
          type: "object",
          properties: {
            finding: {
              type: "string",
              description: "Description of urgent finding",
            },
            urgency: {
              type: "string",
              enum: ["stat", "urgent", "semi_urgent"],
              description: "Level of urgency",
            },
            recommendedAction: {
              type: "string",
              description: "Recommended immediate action",
            },
            communicatedTo: {
              type: "string",
              description: "Who was notified of urgent finding",
            },
          },
        },
      },
      incidentalFindings: {
        type: "array",
        description: "Incidental findings not related to primary indication",
        items: {
          type: "object",
          properties: {
            finding: {
              type: "string",
              description: "Description of incidental finding",
            },
            followUpRecommended: {
              type: "boolean",
              description: "Is follow-up recommended?",
            },
            followUpDetails: {
              type: "string",
              description: "Specific follow-up recommendations",
            },
          },
        },
      },
      // Directly embed core.diagnosis schema for imaging-based diagnoses
      imagingDiagnoses: {
        type: "array",
        description: "Diagnoses or impressions based on imaging findings",
        items: coreDiagnosis,
      },
      impression: {
        type: "string",
        description:
          "Overall radiological impression/summary. Translate to [LANGUAGE] if needed.",
      },
      clinicalIndication: {
        type: "string",
        description: "Clinical indication for imaging study",
      },
      clinicalHistory: {
        type: "string",
        description: "Relevant clinical history provided",
      },
      // Directly embed core.performer for interpreting radiologist
      interpretingRadiologist: corePerformer,
      technologist: {
        type: "string",
        description: "Technologist who performed the study",
      },
      equipment: {
        type: "object",
        properties: {
          manufacturer: {
            type: "string",
            description: "Equipment manufacturer",
          },
          model: {
            type: "string",
            description: "Equipment model",
          },
          fieldStrength: {
            type: "string",
            description: "Field strength for MRI studies",
          },
          technique: {
            type: "string",
            description: "Specific imaging technique parameters",
          },
        },
      },
      recommendations: {
        type: "array",
        description: "Recommendations for further imaging or follow-up",
        items: {
          type: "object",
          properties: {
            recommendation: {
              type: "string",
              description: "Specific recommendation",
            },
            timeframe: {
              type: "string",
              description: "Recommended timeframe",
            },
            indication: {
              type: "string",
              description: "Indication for recommendation",
            },
            priority: {
              type: "string",
              enum: ["routine", "urgent", "stat"],
              description: "Priority level",
            },
          },
        },
      },
      additionalComments: {
        type: "string",
        description: "Additional comments or observations",
      },
    },
    required: ["hasImagingFindings"],
  },
} as FunctionDefinition;
