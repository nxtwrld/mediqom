import type { FunctionDefinition } from "@langchain/core/language_models/base";

export default {
  name: "procedures_extractor",
  description:
    "Extract surgical and medical procedures from medical documents. Identify procedure details, techniques, team members, and outcomes.",
  parameters: {
    type: "object",
    properties: {
      hasProcedures: {
        type: "boolean",
        description: "Does this document contain procedure information?",
      },
      procedures: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the procedure performed. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            cptCode: {
              type: "string",
              description: "CPT procedure code if available",
            },
            duration: {
              type: "number",
              description: "Duration of procedure in minutes",
            },
            technique: {
              type: "string",
              description: "Surgical technique or approach used. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            startTime: {
              type: "string",
              description: "Procedure start time if available",
            },
            endTime: {
              type: "string",
              description: "Procedure end time if available",
            },
            findings: {
              type: "string",
              description:
                "Key findings during the procedure. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            complications: {
              type: "array",
              items: { type: "string" },
              description: "Any complications that occurred. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            outcome: {
              type: "string",
              enum: [
                "successful",
                "partially_successful",
                "complicated",
                "incomplete",
                "failed",
              ],
              description: "Overall outcome of the procedure",
            },
            procedureCategory: {
              type: "string",
              enum: [
                "surgical",
                "diagnostic",
                "therapeutic",
                "interventional",
                "emergency",
                "minimally_invasive",
                "endoscopic",
                "imaging_guided",
              ],
              description: "Category of procedure for classification",
            },
            searchKeywords: {
              type: "array",
              items: { type: "string" },
              description:
                "Search-optimized keywords: CPT codes, procedure types, anatomical regions, specialties",
            },
          },
          required: ["name"],
        },
      },
      surgicalTeam: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: {
              type: "string",
              enum: [
                "surgeon",
                "assistant",
                "anesthesiologist",
                "nurse",
                "technician",
                "consultant",
              ],
              description: "Role (surgeon, assistant, anesthesiologist, etc.)",
            },
            credentials: { type: "string" },
          },
        },
        description: "Members of the surgical/procedure team",
      },
      location: {
        type: "string",
        description:
          "Location where procedures were performed (OR, procedure room, etc.). Translate result to the [LANGUAGE] language if the source is in a different language.",
      },
    },
    required: ["hasProcedures"],
  },
} as FunctionDefinition;
