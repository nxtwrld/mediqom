import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreRecommendations from "./core.recommendations";
import coreDiagnosis from "./core.diagnosis";
import corePerformer from "./core.performer";
import coreBodyParts from "./core.bodyParts";
import coreTreatmentGoal from "./core.treatmentGoal";

/**
 * Treatment Plan Schema
 *
 * Extracts structured treatment plans including chemotherapy, radiation, surgery.
 * Reuses core components for consistency.
 */
export default {
  name: "extract_treatment_plan",
  description:
    "Extract comprehensive structured treatment plans including chemotherapy protocols, radiation therapy, surgical plans, and multimodal treatment approaches.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasTreatmentPlan: {
        type: "boolean",
        description: "Does this document contain a structured treatment plan?",
      },
      treatmentIntent: {
        type: "string",
        enum: [
          "curative",
          "palliative",
          "adjuvant",
          "neoadjuvant",
          "maintenance",
          "supportive",
        ],
        description: "Overall intent of treatment",
      },
      // Reuse core.diagnosis for target diagnosis
      targetDiagnosis: coreDiagnosis,

      chemotherapy: {
        type: "object",
        description: "Chemotherapy treatment plan",
        properties: {
          planned: {
            type: "boolean",
            description: "Is chemotherapy planned?",
          },
          regimen: {
            type: "string",
            description:
              "Chemotherapy regimen name. Use standardized terminology from the [LANGUAGE] localization set.",
          },
          agents: {
            type: "array",
            description: "Individual chemotherapy agents",
            items: {
              type: "object",
              properties: {
                drug: {
                  type: "string",
                  description: "Drug name",
                },
                dose: {
                  type: "string",
                  description: "Dose and units",
                },
                route: {
                  type: "string",
                  enum: ["IV", "PO", "IM", "SC", "intrathecal", "topical"],
                  description: "Route of administration",
                },
                frequency: {
                  type: "string",
                  description: "Dosing frequency",
                },
              },
              required: ["drug"],
            },
          },
          cycles: {
            type: "object",
            properties: {
              planned: {
                type: "number",
                description: "Number of planned cycles",
              },
              completed: {
                type: "number",
                description: "Number of completed cycles",
              },
              cycleLength: {
                type: "string",
                description: "Cycle length (e.g., '21 days')",
              },
            },
          },
          startDate: {
            type: "string",
            description: "Treatment start date (ISO format)",
          },
          endDate: {
            type: "string",
            description: "Planned end date (ISO format)",
          },
        },
      },

      radiationTherapy: {
        type: "object",
        description: "Radiation therapy plan",
        properties: {
          planned: {
            type: "boolean",
            description: "Is radiation therapy planned?",
          },
          technique: {
            type: "string",
            description:
              "Radiation technique. Use standardized terminology from the [LANGUAGE] localization set.",
          },
          // Reuse core.bodyParts for treatment sites
          treatmentSites: coreBodyParts,
          dose: {
            type: "object",
            properties: {
              totalDose: {
                type: "string",
                description: "Total planned dose (e.g., '60 Gy')",
              },
              fractionDose: {
                type: "string",
                description: "Dose per fraction (e.g., '2 Gy')",
              },
              fractions: {
                type: "number",
                description: "Number of fractions",
              },
            },
          },
          schedule: {
            type: "string",
            description: "Treatment schedule (e.g., 'daily Monday-Friday')",
          },
          startDate: {
            type: "string",
            description: "Treatment start date (ISO format)",
          },
        },
      },

      surgery: {
        type: "object",
        description: "Surgical treatment plan",
        properties: {
          planned: {
            type: "boolean",
            description: "Is surgery planned?",
          },
          procedures: {
            type: "array",
            description: "Planned surgical procedures",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Procedure name. Use standardized terminology from the [LANGUAGE] localization set.",
                },
                approach: {
                  type: "string",
                  enum: [
                    "open",
                    "laparoscopic",
                    "robotic",
                    "endoscopic",
                    "minimally_invasive",
                  ],
                  description: "Surgical approach",
                },
                // Reuse core.bodyParts for surgical sites
                targetSites: coreBodyParts,
                urgency: {
                  type: "string",
                  enum: ["emergency", "urgent", "elective"],
                  description: "Surgical urgency",
                },
                plannedDate: {
                  type: "string",
                  description: "Planned surgery date (ISO format)",
                },
              },
              required: ["name"],
            },
          },
          // Expected roles: surgeon, surgeon_cardiac, surgeon_orthopedic, surgeon_plastic, oncologist_surgical
          surgeon: corePerformer,
        },
      },

      targetedTherapy: {
        type: "object",
        description: "Targeted/immunotherapy plan",
        properties: {
          planned: {
            type: "boolean",
            description: "Is targeted therapy planned?",
          },
          agents: {
            type: "array",
            description: "Targeted therapy agents",
            items: {
              type: "object",
              properties: {
                drug: {
                  type: "string",
                  description: "Drug name",
                },
                target: {
                  type: "string",
                  description:
                    "Molecular target. Use standardized terminology from the [LANGUAGE] localization set.",
                },
                biomarkerRequired: {
                  type: "string",
                  description:
                    "Required biomarker for treatment. Use standardized terminology from the [LANGUAGE] localization set.",
                },
                schedule: {
                  type: "string",
                  description: "Dosing schedule",
                },
              },
              required: ["drug"],
            },
          },
        },
      },

      supportiveCare: {
        type: "array",
        description: "Supportive care measures",
        items: {
          type: "object",
          properties: {
            intervention: {
              type: "string",
              description:
                "Supportive care intervention. Use standardized terminology from the [LANGUAGE] localization set.",
            },
            indication: {
              type: "string",
              description:
                "Indication for intervention. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            schedule: {
              type: "string",
              description: "Schedule or frequency",
            },
          },
        },
      },

      treatmentTimeline: {
        type: "array",
        description: "Treatment sequence and timeline",
        items: {
          type: "object",
          properties: {
            phase: {
              type: "string",
              description: "Treatment phase (e.g., 'Cycle 1', 'Week 1-3')",
            },
            interventions: {
              type: "array",
              description: "Interventions in this phase",
              items: {
                type: "string",
              },
            },
            startDate: {
              type: "string",
              description: "Phase start date (ISO format)",
            },
            duration: {
              type: "string",
              description: "Phase duration",
            },
          },
        },
      },

      // Reuse core.recommendations for treatment recommendations
      treatmentRecommendations: coreRecommendations,

      // Additional performers (primary performer extracted by medical-analysis node)
      // Expected roles: oncologist, oncologist_medical, oncologist_radiation, oncologist_surgical
      treatingOncologist: corePerformer,

      treatmentGoals: {
        type: "array",
        description: "Specific treatment goals",
        items: coreTreatmentGoal,
      },

      contraindications: {
        type: "array",
        description: "Treatment contraindications or limitations",
        items: {
          type: "string",
          description:
            "Contraindication. Use standardized terminology from the [LANGUAGE] localization set.",
        },
      },

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in treatment plan extraction (0-1)",
      },
    },
    required: ["hasTreatmentPlan"],
  },
} as FunctionDefinition;
