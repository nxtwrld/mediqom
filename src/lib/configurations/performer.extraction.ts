import type { FunctionDefinition } from "@langchain/core/language_models/base";
import corePerformer from "./core.performer";

/**
 * Performer Extraction Schema
 *
 * Focused node for extracting healthcare provider information from medical documents.
 */
export default {
  name: "extract_performer",
  description:
    "Extract healthcare provider and medical professional information from medical documents including roles, names, and institutional affiliations.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      performer: corePerformer,

      // Processing metadata
      processingConfidence: {
        type: "number",
        description: "Overall confidence in performer extraction (0.0 to 1.0)",
      },

      processingNotes: {
        type: "string",
        description:
          "Any notes about the performer extraction process or ambiguities encountered",
      },
    },
    required: ["performer", "processingConfidence"],
  },
} as FunctionDefinition;
