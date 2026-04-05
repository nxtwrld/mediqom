import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreSignals from "./core.signals";
import corePerformer from "./core.performer";

/**
 * Anesthesia Schema
 *
 * Extracts anesthesia information including type, monitoring, medications, and events.
 * Directly embeds core schemas for proper data structure consistency.
 */
export default {
  name: "extract_anesthesia_information",
  description:
    "Extract all anesthesia-related information including type, monitoring data, medications administered, and anesthetic events from operative reports or anesthesia records.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasAnesthesia: {
        type: "boolean",
        description: "Does this document contain anesthesia information?",
      },
      anesthesiaType: {
        type: "string",
        enum: [
          "general",
          "regional",
          "spinal",
          "epidural",
          "local",
          "sedation",
          "MAC",
          "combined",
          "other",
        ],
        description: "Primary type of anesthesia used",
      },
      anesthesiaDetails: {
        type: "object",
        properties: {
          technique: {
            type: "string",
            enum: [
              "general",
              "spinal",
              "epidural",
              "local",
              "regional",
              "sedation",
            ],
            description: "Specific anesthesia technique used",
          },
          inductionTime: {
            type: "string",
            description: "Time of anesthesia induction",
          },
          emergenceTime: {
            type: "string",
            description: "Time of emergence from anesthesia",
          },
          duration: {
            type: "number",
            description: "Total duration of anesthesia in minutes. ONLY populate if explicitly stated in the document.",
          },
          airwayManagement: {
            type: "object",
            properties: {
              method: {
                type: "string",
                enum: [
                  "mask",
                  "LMA",
                  "endotracheal_tube",
                  "nasal_cannula",
                  "face_mask",
                  "other",
                ],
                description: "Airway management method",
              },
              tubeSize: {
                type: "string",
                description: "Size of endotracheal tube if used",
              },
              attempts: {
                type: "number",
                description: "Number of intubation attempts. ONLY populate if explicitly stated in the document.",
              },
              difficulty: {
                type: "string",
                enum: ["easy", "moderate", "difficult", "failed"],
                description: "Intubation difficulty",
              },
            },
          },
        },
      },
      medications: {
        type: "array",
        description: "Medications administered during anesthesia",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Medication name",
            },
            dose: {
              type: "string",
              description: "Dose administered",
            },
            route: {
              type: "string",
              enum: [
                "IV",
                "IM",
                "inhalation",
                "epidural",
                "spinal",
                "local",
                "other",
              ],
              description: "Route of administration",
            },
            time: {
              type: "string",
              description: "Time of administration",
            },
            purpose: {
              type: "string",
              description: "Purpose (e.g., induction, maintenance, reversal)",
            },
          },
          required: ["name", "dose"],
        },
      },
      // Directly embed core.signals for vital signs monitoring
      vitalSignsMonitoring: coreSignals,
      fluidManagement: {
        type: "object",
        properties: {
          crystalloids: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "normal_saline",
                  "lactated_ringers",
                  "dextrose",
                  "plasmalyte",
                ],
                description: "Type of crystalloid",
              },
              volume: {
                type: "string",
                description: "Total volume administered (e.g., '1500 ml')",
              },
            },
          },
          colloids: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["albumin", "hetastarch", "dextran", "gelatin"],
                description: "Type of colloid",
              },
              volume: {
                type: "string",
                description: "Total volume administered",
              },
            },
          },
          bloodProducts: {
            type: "array",
            description: "Blood products administered",
            items: {
              type: "object",
              properties: {
                product: {
                  type: "string",
                  enum: [
                    "PRBC",
                    "FFP",
                    "platelets",
                    "cryoprecipitate",
                    "whole_blood",
                  ],
                  description: "Type of blood product",
                },
                units: {
                  type: "number",
                  description: "Number of units",
                },
              },
            },
          },
          estimatedBloodLoss: {
            type: "string",
            description: "Estimated blood loss (e.g., '250 ml'). ONLY populate if explicitly stated in the document.",
          },
          urineOutput: {
            type: "string",
            description: "Total urine output (e.g., '400 ml')",
          },
        },
      },
      complications: {
        type: "array",
        description: "Anesthesia-related complications",
        items: {
          type: "object",
          properties: {
            complication: {
              type: "string",
              description:
                "Description of complication. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            time: {
              type: "string",
              description: "Time of occurrence",
            },
            intervention: {
              type: "string",
              description: "Intervention performed",
            },
            resolved: {
              type: "boolean",
              description: "Whether complication was resolved",
            },
          },
          required: ["complication"],
        },
      },
      // Directly embed core.performer for anesthesia team
      anesthesiaTeam: {
        type: "array",
        description: "Anesthesia team members",
        items: corePerformer,
      },
      patientStatus: {
        type: "object",
        properties: {
          asaClass: {
            type: "string",
            enum: ["I", "II", "III", "IV", "V", "VI", "E"],
            description: "ASA physical status classification",
          },
          mallampati: {
            type: "string",
            enum: ["I", "II", "III", "IV"],
            description: "Mallampati score",
          },
          allergies: {
            type: "array",
            description: "Known drug allergies",
            items: {
              type: "string",
            },
          },
        },
      },
      postAnesthesia: {
        type: "object",
        properties: {
          recoveryTime: {
            type: "number",
            description: "Time in recovery room (minutes). ONLY populate if explicitly stated in the document.",
          },
          painScore: {
            type: "number",
            description: "Pain score on emergence (0-10). ONLY populate if explicitly stated in the document.",
            minimum: 0,
            maximum: 10,
          },
          nauseaVomiting: {
            type: "boolean",
            description: "Presence of post-operative nausea/vomiting",
          },
          disposition: {
            type: "string",
            enum: ["PACU", "ICU", "floor", "home", "other"],
            description: "Post-anesthesia disposition",
          },
        },
      },
    },
    required: ["hasAnesthesia"],
  },
} as FunctionDefinition;
