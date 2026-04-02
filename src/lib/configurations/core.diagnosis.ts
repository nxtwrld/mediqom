export default {
  type: "array",
  description:
    "Array of diagnoses for the patient. Include primary, secondary, and differential diagnoses. Leave empty if no diagnoses are available in the document.",
  items: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "The ICD-10 code of the diagnosis",
      },
      description: {
        type: "string",
        description:
          "Description of the diagnosis if given. Translate result to the [LANGUAGE] language if the source is in a different language.",
      },
      type: {
        type: "string",
        enum: [
          "primary",
          "secondary",
          "differential",
          "rule_out",
          "provisional",
          "confirmed",
        ],
        description:
          "Type of diagnosis - primary (main condition), secondary (comorbid condition), differential (possible diagnosis), rule_out (to be excluded), provisional (tentative), or confirmed (definitive)",
      },
      confidence: {
        type: "string",
        enum: ["confirmed", "probable", "possible", "suspected"],
        description: "Confidence level of the diagnosis",
      },
      date: {
        type: "string",
        description: "Date when diagnosis was made or confirmed (if available)",
      },
      notes: {
        type: "string",
        description: "Additional notes or context about the diagnosis. Translate result to the [LANGUAGE] language if the source is in a different language.",
      },
      searchKeywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Search-optimized keywords: ICD-10 codes, Latin terms, body systems, diagnostic categories",
      },
    },
    required: ["description"],
  },
};
