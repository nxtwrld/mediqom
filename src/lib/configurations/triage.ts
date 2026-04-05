import type { FunctionDefinition } from "@langchain/core/language_models/base";

export default {
  name: "triage_extractor",
  description:
    "Extract emergency department triage and initial assessment information from medical documents. CRITICAL: ONLY extract information that is explicitly stated in the document. Do NOT infer, guess, or fabricate any values. If a field is not mentioned in the document, omit it entirely. Never use default or zero values (e.g., blood pressure '0/0' or pain score '0') — omit the field instead.",
  parameters: {
    type: "object",
    properties: {
      hasTriage: {
        type: "boolean",
        description: "Does this document contain triage information?",
      },
      chiefComplaint: {
        type: "string",
        description:
          "Primary reason for emergency department visit as stated by patient. Translate result to the [LANGUAGE] language if the source is in a different language.",
      },
      triageLevel: {
        type: "number",
        description: "Triage acuity level (1-5, where 1 is most urgent)",
      },
      arrivalTime: {
        type: "string",
        description:
          "Time of arrival to emergency department. Format: YYYY-MM-DD HH:MM:SS",
      },
      modeOfArrival: {
        type: "string",
        enum: [
          "ambulance",
          "walk_in",
          "helicopter",
          "police",
          "private_vehicle",
          "public_transport",
        ],
        description: "How patient arrived",
      },
      urgencyClassification: {
        type: "string",
        description:
          "Urgency classification (emergent, urgent, less urgent, non-urgent)",
      },
      initialVitals: {
        type: "object",
        properties: {
          temperature: { type: "number", description: "Body temperature. ONLY populate if explicitly stated in the document." },
          bloodPressure: {
            type: "string",
            description: "Blood pressure reading. ONLY populate if explicitly stated in the document. Do NOT use placeholder values like '0/0'.",
          },
          heartRate: { type: "number", description: "Heart rate in BPM. ONLY populate if explicitly stated in the document." },
          respiratoryRate: { type: "number", description: "Respiratory rate. ONLY populate if explicitly stated in the document." },
          oxygenSaturation: {
            type: "number",
            description: "Oxygen saturation percentage. ONLY populate if explicitly stated in the document.",
          },
          painScore: { type: "number", description: "Pain scale score (0-10). ONLY populate if explicitly stated in the document. Do NOT default to 0." },
        },
      },
      allergies: {
        type: "array",
        items: { type: "string" },
        description: "Known allergies mentioned during triage. ONLY list allergies explicitly mentioned in the document.",
      },
      currentMedications: {
        type: "array",
        items: { type: "string" },
        description: "Current medications mentioned during triage. ONLY list medications explicitly mentioned in the document.",
      },
      triageNotes: {
        type: "string",
        description:
          "Additional triage assessment notes. Translate result to the [LANGUAGE] language if the source is in a different language.",
      },
    },
    required: ["hasTriage"],
  },
} as FunctionDefinition;
