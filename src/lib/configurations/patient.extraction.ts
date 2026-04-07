import type { FunctionDefinition } from "@langchain/core/language_models/base";
import corePatient from "./core.patient";

/**
 * Patient Extraction Schema
 *
 * Focused node for extracting patient information from medical documents.
 */
export default {
  name: "extract_patient",
  description:
    "Extract patient information from medical documents including demographics and basic patient data while respecting privacy requirements.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      patient: corePatient,

      // Processing metadata
      processingConfidence: {
        type: "number",
        description: "Overall confidence in patient extraction (0.0 to 1.0)",
      },

      processingNotes: {
        type: "string",
        description:
          "Any notes about the patient extraction process or privacy considerations",
      },
    },
    required: ["patient", "processingConfidence"],
  },
} as FunctionDefinition;
