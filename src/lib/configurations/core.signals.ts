export default {
  type: "array",
  description: `
    Proceed step by step. 
    Step 1: Extract all medical measurements from the text. 
    Step 2: Extract all lab tests from the text.
    Step 3: Evaluate the values and units of the lab tests and match them to proper signals and sources.
    `,
  items: {
    type: "object",
    properties: {
      signal: {
        type: "string",
        description:
          "Name of the lab test. If the test is a combination of multiple tests, list them all. If the test is a general. Select a property from the provided enum.",
        enum: [],
      },
      value: {
        type: "string",
        description:
          "Value of the lab test. If the it contains a numeric value, convert the decimals to a dot. If the value is a range, use a dash to separate the values. If the value is a text, leave it as is.",
      },
      valueType: {
        type: "string",
        description:
          "Type of the value. Select a property from the provided enum.",
        enum: ["number", "text"],
      },
      unit: {
        type: "string",
        description: "Unit of the lab test.",
      },
      reference: {
        type: "string",
        description:
          "Reference range of the lab test NUMBER - NUMBER or an appropriate alternative. Convert the decimals to a dot. If not reference is available, leave empty.",
      },
      source: {
        type: "string",
        description:
          "Source of the lab test. Based on the lab test name and values and units provided, derive the source of the test. If the source is not available or unclear, leave empty.",
        enum: [
          "blood",
          "urine",
          "saliva",
          "stool",
          "sputum",
          "cerebrospinal fluid",
          "tears",
          "sweat",
          "breast milk",
          "vaginal secretion",
          "semen",
          "amniotic",
        ],
      },
      urgency: {
        type: "number",
        description:
          "Urgency of the result based on the value and refrence range result on a scale of 1-5. 1 - not severe, 5 - very severe. where 1 is non issue - just a general statement, 2 and up are issues detected, that need to be reflected upon.",
      },
      date: {
        type: "string",
        description:
          "Date of the measurement or lab test in the format YYYY-MM-DD. Derive date from context. If the date is not available, leave empty.",
      },
      labCategory: {
        type: "string",
        enum: [
          "hematology",
          "chemistry",
          "immunology",
          "microbiology",
          "molecular",
          "toxicology",
          "endocrinology",
          "cardiology",
          "oncology",
          "genetics",
        ],
        description: "Laboratory category for classification",
      },
      searchTerms: {
        type: "array",
        items: { type: "string" },
        description:
          "Search-optimized terms: LOINC codes, test abbreviations, medical terms, biomarkers",
      },
    },
    required: ["signal", "date", "value", "valueType", "unit", "reference"],
  },
};
