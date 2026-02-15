import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreSignals from "./core.signals";

/**
 * Signals Extraction Schema
 *
 * Wraps core.signals (raw array schema) into a proper FunctionDefinition
 * for OpenAI function calling, which requires { type: "object" } at root.
 */
export default {
  name: "extract_signals",
  description:
    "Extract lab results, medical measurements, and vital signs from medical documents. Includes blood work, urinalysis, and other diagnostic test results.",
  parameters: {
    type: "object",
    properties: {
      signals: coreSignals,

      // Processing metadata
      processingConfidence: {
        type: "number",
        description:
          "Overall confidence in signal extraction (0.0 to 1.0)",
      },

      processingNotes: {
        type: "string",
        description:
          "Any notes about the signal extraction process or ambiguities encountered",
      },
    },
    required: ["signals", "processingConfidence"],
  },
} as FunctionDefinition;
