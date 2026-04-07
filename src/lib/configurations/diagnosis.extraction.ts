import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreDiagnosis from "./core.diagnosis";

/**
 * Diagnosis Extraction Schema
 *
 * Focused node for extracting diagnosis information from medical documents.
 */
export default {
  name: "extract_diagnosis",
  description:
    "Extract diagnosis information from medical documents including primary, secondary, and differential diagnoses. Focus on accurate ICD-10 coding and confidence assessment.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      diagnosis: coreDiagnosis,

      // Processing metadata
      processingConfidence: {
        type: "number",
        description: "Overall confidence in diagnosis extraction (0.0 to 1.0)",
      },

      processingNotes: {
        type: "string",
        description:
          "Any notes about the diagnosis extraction process or ambiguities encountered",
      },
    },
    required: ["diagnosis", "processingConfidence"],
  },
} as FunctionDefinition;
