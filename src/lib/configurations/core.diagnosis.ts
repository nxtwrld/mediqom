export default {
  type: "array",
  description:
    "Array of diagnoses for the patient. Include primary, secondary, and differential diagnoses. Leave empty if no diagnoses are available in the document. Do NOT infer diagnoses not explicitly stated in the document.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
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
      snomedCode: {
        type: "string",
        description:
          "SNOMED CT concept identifier for this diagnosis. ONLY populate when you are certain this is the correct SNOMED CT concept. Omit if uncertain — an absent code is preferable to an incorrect one. Numeric string only, no prefix (e.g., '73211009' for Type 2 diabetes mellitus, '44054006' for Diabetes mellitus type 2 — use the most specific applicable concept).",
      },
      linkedCarePlanItemId: {
        type: "string",
        description:
          "ONLY valid when a Care Plan context block is present in the input: the id of an EXISTING Care Plan item from that context which this diagnosis refers to (same condition). Matching rules: an exact ICD-10 match is the hard anchor; body-part rollup overlap is a soft supporting signal; description similarity across languages counts. Copy the id verbatim from the context. Omit when no context is provided or no existing item matches.",
      },
      isNewCondition: {
        type: "boolean",
        description:
          "ONLY valid when a Care Plan context block is present in the input: true when this diagnosis does not match any existing item in the context. Omit when no context is provided.",
      },
      progressionFrom: {
        type: "string",
        description:
          "ONLY valid when a Care Plan context block is present in the input: the id of an existing Care Plan item that this diagnosis SUPERSEDES (e.g. stage 1 → stage 2, provisional → confirmed under a different code). Use linkedCarePlanItemId instead when it is the same condition restated. Copy the id verbatim from the context. Omit otherwise.",
      },
      linkReason: {
        type: "string",
        description:
          "Short phrase explaining WHY linkedCarePlanItemId or progressionFrom was chosen (e.g. 'matched by ICD-10 M76.5', 'matched by R_knee rollup + description'). ONLY populate together with one of those fields.",
      },
      relatedTo: {
        type: "array",
        description:
          "ONLY valid when a Care Plan context block is present in the input: existing Care Plan items this diagnosis belongs with but must NOT be collapsed into (e.g. same ICD-10 code on the opposite side of the body). Copy ids verbatim from the context. Omit otherwise.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Id of the related Care Plan item from the context",
            },
            reason: {
              type: "string",
              enum: ["laterality", "progression", "comorbidity"],
              description: "Why the items are related but kept separate",
            },
          },
          required: ["id", "reason"],
        },
      },
    },
    required: ["description"],
  },
};
