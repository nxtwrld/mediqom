import type { FunctionDefinition } from "@langchain/core/language_models/base";
import corePerformer from "./core.performer";

/**
 * Allergies Schema
 *
 * Extracts comprehensive allergy and adverse reaction information including
 * medications, foods, environmental allergens, and other substances.
 * Critical for patient safety and treatment planning.
 */
export default {
  name: "extract_allergy_information",
  description:
    "Extract all allergy and adverse reaction information including drug allergies, food allergies, environmental allergies, and other sensitivities with detailed reaction descriptions and severity levels.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasAllergies: {
        type: "boolean",
        description: "Does this document contain allergy information?",
      },
      noKnownAllergies: {
        type: "boolean",
        description: "Is 'No Known Allergies' or 'NKDA' explicitly stated?",
      },
      allergies: {
        type: "array",
        description: "List of documented allergies and adverse reactions",
        items: {
          type: "object",
          properties: {
            allergen: {
              type: "string",
              description: "Name of the allergen or substance",
            },
            category: {
              type: "string",
              enum: [
                "medication",
                "food",
                "environmental",
                "latex",
                "contrast",
                "other_chemical",
                "biological",
                "unknown",
              ],
              description: "Category of allergen",
            },
            medicationDetails: {
              type: "object",
              description: "Additional details for medication allergies",
              properties: {
                genericName: {
                  type: "string",
                  description: "Generic drug name",
                },
                brandName: {
                  type: "string",
                  description: "Brand/trade name",
                },
                drugClass: {
                  type: "string",
                  description: "Pharmacological class",
                },
                activeIngredient: {
                  type: "string",
                  description: "Active ingredient if known",
                },
              },
            },
            reactionType: {
              type: "string",
              enum: [
                "allergic_reaction",
                "anaphylaxis",
                "intolerance",
                "side_effect",
                "toxicity",
                "unknown",
                "pseudoallergy",
              ],
              description: "Type of adverse reaction",
            },
            severity: {
              type: "string",
              enum: [
                "mild",
                "moderate",
                "severe",
                "life_threatening",
                "fatal",
                "unknown",
              ],
              description: "Severity of allergic reaction",
            },
            reactions: {
              type: "array",
              description: "Specific symptoms/reactions experienced",
              items: {
                type: "object",
                properties: {
                  symptom: {
                    type: "string",
                    description: "Specific symptom or reaction",
                  },
                  system: {
                    type: "string",
                    enum: [
                      "dermatologic",
                      "respiratory",
                      "cardiovascular",
                      "gastrointestinal",
                      "neurologic",
                      "systemic",
                      "other",
                    ],
                    description: "Body system affected",
                  },
                  onset: {
                    type: "string",
                    description: "Time to onset of reaction",
                  },
                  duration: {
                    type: "string",
                    description: "Duration of reaction",
                  },
                },
              },
            },
            onsetDate: {
              type: "string",
              description:
                "Date when allergy was first identified (ISO format)",
            },
            lastReactionDate: {
              type: "string",
              description: "Date of most recent reaction (ISO format)",
            },
            certainty: {
              type: "string",
              enum: [
                "confirmed",
                "probable",
                "possible",
                "unlikely",
                "refuted",
              ],
              description: "Certainty level of the allergy",
            },
            status: {
              type: "string",
              enum: ["active", "resolved", "inactive", "entered_in_error"],
              description: "Current status of the allergy",
            },
            clinicalStatus: {
              type: "string",
              enum: ["active", "inactive", "resolved"],
              description: "Clinical status as per FHIR standards",
            },
            verificationStatus: {
              type: "string",
              enum: ["unconfirmed", "confirmed", "refuted", "entered_in_error"],
              description: "Verification status as per FHIR standards",
            },
            exposureRoute: {
              type: "array",
              description: "Route(s) of exposure that cause reaction",
              items: {
                type: "string",
                enum: [
                  "oral",
                  "intravenous",
                  "intramuscular",
                  "subcutaneous",
                  "topical",
                  "inhalation",
                  "ingestion",
                  "contact",
                  "unknown",
                ],
              },
            },
            crossReactivities: {
              type: "array",
              description: "Known cross-reactive allergens",
              items: {
                type: "string",
              },
            },
            avoidanceInstructions: {
              type: "string",
              description:
                "Specific avoidance instructions for patient. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            emergencyTreatment: {
              type: "object",
              properties: {
                required: {
                  type: "boolean",
                  description:
                    "Does this allergy require emergency treatment plan?",
                },
                epipenPrescribed: {
                  type: "boolean",
                  description: "Is an epinephrine auto-injector prescribed?",
                },
                emergencyMedications: {
                  type: "array",
                  description: "Emergency medications prescribed",
                  items: {
                    type: "string",
                  },
                },
                emergencyInstructions: {
                  type: "string",
                  description:
                    "Emergency treatment instructions. Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
              },
            },
            alternativeTreatments: {
              type: "array",
              description:
                "Alternative medications or treatments that can be safely used",
              items: {
                type: "string",
              },
            },
            testingDetails: {
              type: "object",
              properties: {
                testPerformed: {
                  type: "boolean",
                  description: "Was allergy testing performed?",
                },
                testType: {
                  type: "string",
                  enum: [
                    "skin_prick",
                    "intradermal",
                    "patch_test",
                    "blood_test",
                    "challenge_test",
                    "elimination_diet",
                    "other",
                  ],
                  description: "Type of allergy test",
                },
                testDate: {
                  type: "string",
                  description: "Date of allergy testing",
                },
                results: {
                  type: "string",
                  description: "Test results",
                },
                laboratory: {
                  type: "string",
                  description: "Laboratory or facility where testing was done",
                },
              },
            },
            reportedBy: {
              type: "string",
              enum: [
                "patient",
                "family_member",
                "healthcare_provider",
                "previous_records",
                "other",
              ],
              description: "Who reported this allergy",
            },
            notes: {
              type: "string",
              description:
                "Additional notes about the allergy. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            // Directly embed core.performer for documenting provider
            documentingProvider: corePerformer,
          },
        },
      },
      drugIntolerances: {
        type: "array",
        description: "Drug intolerances (distinct from true allergies)",
        items: {
          type: "object",
          properties: {
            medication: {
              type: "string",
              description: "Medication name",
            },
            reaction: {
              type: "string",
              description: "Intolerance reaction",
            },
            notes: {
              type: "string",
              description:
                "Additional notes about intolerance. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
          },
        },
      },
      environmentalSensitivities: {
        type: "array",
        description: "Environmental sensitivities and triggers",
        items: {
          type: "object",
          properties: {
            trigger: {
              type: "string",
              description: "Environmental trigger",
            },
            reaction: {
              type: "string",
              enum: [
                "rash",
                "hives",
                "swelling",
                "itching",
                "sneezing",
                "runny_nose",
                "watery_eyes",
                "coughing",
                "wheezing",
                "shortness_of_breath",
                "nausea",
                "headache",
                "fatigue",
                "anaphylaxis",
                "breathing_difficulty",
                "other",
              ],
              description: "Reaction to trigger",
            },
            severity: {
              type: "string",
              enum: ["mild", "moderate", "severe"],
              description: "Severity of reaction",
            },
            seasonal: {
              type: "boolean",
              description: "Is this a seasonal sensitivity?",
            },
            season: {
              type: "string",
              description: "Specific season if seasonal",
            },
          },
        },
      },
      familyAllergyHistory: {
        type: "array",
        description: "Family history of allergies",
        items: {
          type: "object",
          properties: {
            relative: {
              type: "string",
              description: "Family member (e.g., mother, father, sibling)",
            },
            allergen: {
              type: "string",
              description: "Allergen",
            },
            reaction: {
              type: "string",
              enum: [
                "rash",
                "hives",
                "swelling",
                "itching",
                "sneezing",
                "runny_nose",
                "watery_eyes",
                "coughing",
                "wheezing",
                "shortness_of_breath",
                "nausea",
                "headache",
                "fatigue",
                "anaphylaxis",
                "breathing_difficulty",
                "other",
              ],
              description: "Type of reaction",
            },
          },
        },
      },
      allergyAlerts: {
        type: "array",
        description: "Special allergy alerts or warnings",
        items: {
          type: "object",
          properties: {
            alert: {
              type: "string",
              description:
                "Alert message. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
              description: "Alert priority level",
            },
            instructions: {
              type: "string",
              description:
                "Special instructions related to alert. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
          },
        },
      },
      lastUpdated: {
        type: "string",
        description: "Date when allergy information was last updated",
      },
      reviewDate: {
        type: "string",
        description: "Date when allergies should be reviewed again",
      },
      source: {
        type: "string",
        description: "Source of allergy information",
      },
    },
    required: ["hasAllergies"],
  },
} as FunctionDefinition;
