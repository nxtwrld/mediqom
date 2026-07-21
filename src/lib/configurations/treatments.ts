import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreBodyParts from "./core.bodyParts";
import coreDiagnosis from "./core.diagnosis";
import corePerformer from "./core.performer";
import coreTreatmentGoal from "./core.treatmentGoal";

/**
 * Treatments Schema
 *
 * Extracts treatment protocols and therapeutic interventions.
 * Reuses core components for consistency.
 */
export default {
  name: "extract_treatments",
  description:
    "Extract comprehensive treatment protocols and therapeutic interventions including current treatments, past treatments, and treatment responses.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasTreatments: {
        type: "boolean",
        description:
          "Does this document contain treatment protocols or therapeutic interventions?",
      },

      currentTreatments: {
        type: "array",
        description: "Currently active treatments",
        items: {
          type: "object",
          properties: {
            treatmentName: {
              type: "string",
              description:
                "Name or description of treatment. Use standardized terminology from the [LANGUAGE] localization set.",
            },
            category: {
              type: "string",
              enum: [
                "medication",
                "chemotherapy",
                "radiation_therapy",
                "immunotherapy",
                "surgery",
                "physical_therapy",
                "occupational_therapy",
                "behavioral_therapy",
                "diet_therapy",
                "oxygen_therapy",
                "dialysis",
                "other",
              ],
              description: "Treatment category",
            },
            // Reuse core.diagnosis for indication
            indication: coreDiagnosis,
            // Reuse core.bodyParts for target areas
            targetAreas: coreBodyParts,

            medications: {
              type: "array",
              description: "Medications involved in treatment",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Medication name",
                  },
                  dose: {
                    type: "string",
                    description: "Dose and units",
                  },
                  frequency: {
                    type: "string",
                    description: "Dosing frequency",
                  },
                  route: {
                    type: "string",
                    enum: [
                      "oral",
                      "IV",
                      "IM",
                      "SC",
                      "topical",
                      "inhalation",
                      "rectal",
                      "other",
                    ],
                    description: "Route of administration",
                  },
                  duration: {
                    type: "string",
                    description: "Treatment duration. Translate result to the [LANGUAGE] language if the source is in a different language.",
                  },
                },
                required: ["name"],
              },
            },

            procedures: {
              type: "array",
              description: "Procedures involved in treatment",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Procedure name",
                  },
                  frequency: {
                    type: "string",
                    description: "Procedure frequency",
                  },
                  settings: {
                    type: "string",
                    description: "Procedure settings or parameters. Translate result to the [LANGUAGE] language if the source is in a different language.",
                  },
                },
              },
            },

            startDate: {
              type: "string",
              description: "Treatment start date (ISO format)",
            },
            duration: {
              type: "string",
              description: "Expected or actual treatment duration",
            },
            status: {
              type: "string",
              enum: [
                "active",
                "completed",
                "discontinued",
                "on_hold",
                "planned",
              ],
              description: "Treatment status",
            },

            // Expected roles: oncologist, surgeon, anesthesiologist, cardiologist, other_specialist
            treatingProvider: corePerformer,

            response: {
              type: "object",
              properties: {
                effectiveness: {
                  type: "string",
                  enum: [
                    "excellent",
                    "good",
                    "partial",
                    "poor",
                    "no_response",
                    "too_early",
                  ],
                  description: "Treatment effectiveness",
                },
                sideEffects: {
                  type: "array",
                  description: "Reported side effects",
                  items: {
                    type: "object",
                    properties: {
                      effect: {
                        type: "string",
                        description:
                          "Side effect description. Translate result to the [LANGUAGE] language if the source is in a different language.",
                      },
                      severity: {
                        type: "string",
                        enum: ["mild", "moderate", "severe"],
                        description: "Side effect severity",
                      },
                      frequency: {
                        type: "string",
                        description: "Frequency of side effect",
                      },
                      action: {
                        type: "string",
                        description: "Action taken for side effect",
                      },
                    },
                  },
                },
                tolerability: {
                  type: "string",
                  enum: ["excellent", "good", "fair", "poor"],
                  description: "Overall treatment tolerability",
                },
              },
            },

            modifications: {
              type: "array",
              description: "Treatment modifications made",
              items: {
                type: "object",
                properties: {
                  date: {
                    type: "string",
                    description: "Date of modification (ISO format)",
                  },
                  change: {
                    type: "string",
                    description:
                      "Description of change made. Translate result to the [LANGUAGE] language if the source is in a different language.",
                  },
                  reason: {
                    type: "string",
                    description: "Reason for modification",
                  },
                },
              },
            },
          },
          required: ["treatmentName", "category", "status"],
        },
      },

      pastTreatments: {
        type: "array",
        description: "Previously completed or discontinued treatments",
        items: {
          type: "object",
          properties: {
            treatmentName: {
              type: "string",
              description:
                "Name or description of treatment. Use standardized terminology from the [LANGUAGE] localization set.",
            },
            category: {
              type: "string",
              enum: [
                "medication",
                "chemotherapy",
                "radiation_therapy",
                "immunotherapy",
                "surgery",
                "physical_therapy",
                "occupational_therapy",
                "behavioral_therapy",
                "diet_therapy",
                "oxygen_therapy",
                "dialysis",
                "other",
              ],
              description: "Treatment category",
            },
            // Reuse core.diagnosis for indication
            indication: coreDiagnosis,

            startDate: {
              type: "string",
              description: "Treatment start date (ISO format)",
            },
            endDate: {
              type: "string",
              description: "Treatment end date (ISO format)",
            },
            duration: {
              type: "string",
              description: "Actual treatment duration",
            },

            outcome: {
              type: "object",
              properties: {
                effectiveness: {
                  type: "string",
                  enum: ["excellent", "good", "partial", "poor", "no_response"],
                  description: "Treatment effectiveness",
                },
                reasonForDiscontinuation: {
                  type: "string",
                  description:
                    "Reason treatment was stopped. Use standardized terminology from the [LANGUAGE] localization set.",
                },
                complications: {
                  type: "array",
                  description: "Treatment complications",
                  items: {
                    type: "string",
                  },
                },
              },
            },

            // Expected roles: oncologist, surgeon, anesthesiologist, cardiologist, other_specialist
            treatingProvider: corePerformer,
          },
          required: ["treatmentName", "category"],
        },
      },

      plannedTreatments: {
        type: "array",
        description: "Future planned treatments",
        items: {
          type: "object",
          properties: {
            treatmentName: {
              type: "string",
              description: "Name or description of planned treatment. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            category: {
              type: "string",
              enum: [
                "medication",
                "chemotherapy",
                "radiation_therapy",
                "immunotherapy",
                "surgery",
                "physical_therapy",
                "occupational_therapy",
                "behavioral_therapy",
                "diet_therapy",
                "oxygen_therapy",
                "dialysis",
                "other",
              ],
              description: "Treatment category",
            },
            // Reuse core.diagnosis for indication
            indication: coreDiagnosis,

            plannedStartDate: {
              type: "string",
              description: "Planned start date (ISO format)",
            },
            expectedDuration: {
              type: "string",
              description: "Expected treatment duration",
            },
            priority: {
              type: "string",
              enum: ["urgent", "high", "medium", "low"],
              description: "Treatment priority",
            },
            prerequisites: {
              type: "array",
              description: "Prerequisites before starting treatment. Translate result to the [LANGUAGE] language if the source is in a different language.",
              items: {
                type: "string",
              },
            },

            // Expected roles: oncologist, surgeon, anesthesiologist, cardiologist, other_specialist
            plannedProvider: corePerformer,
          },
          required: ["treatmentName", "category"],
        },
      },

      treatmentGoals: {
        type: "array",
        description: "Overall treatment goals",
        items: coreTreatmentGoal,
      },

      treatmentBarriers: {
        type: "array",
        description: "Barriers to treatment",
        items: {
          type: "object",
          properties: {
            barrier: {
              type: "string",
              description:
                "Description of barrier. Use standardized terminology from the [LANGUAGE] localization set.",
            },
            type: {
              type: "string",
              enum: [
                "financial",
                "access",
                "compliance",
                "medical",
                "social",
                "psychological",
              ],
              description: "Type of barrier",
            },
            impact: {
              type: "string",
              enum: ["low", "moderate", "high"],
              description: "Impact on treatment",
            },
            intervention: {
              type: "string",
              description:
                "Intervention to address barrier. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
          },
        },
      },

      coordinationOfCare: {
        type: "object",
        description: "Care coordination information",
        properties: {
          // Expected roles: care_coordinator, case_manager, nurse_practitioner, physician_assistant
          careCoordinator: corePerformer,
          specialists: {
            type: "array",
            description: "Involved specialists",
            items: corePerformer,
          },
          careTeam: {
            type: "array",
            description: "Care team members",
            items: {
              type: "object",
              properties: {
                role: {
                  type: "string",
                  description: "Team member role",
                },
                // Expected roles: nurse_practitioner, social_worker, physical_therapist, nutritionist, etc.
                provider: corePerformer,
                responsibilities: {
                  type: "array",
                  description: "Specific responsibilities",
                  items: {
                    type: "string",
                  },
                },
              },
            },
          },
          communicationPlan: {
            type: "string",
            description: "Plan for team communication. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
        },
      },

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in treatments extraction (0-1)",
      },
    },
    required: ["hasTreatments"],
  },
} as FunctionDefinition;
