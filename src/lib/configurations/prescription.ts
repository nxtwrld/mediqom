import type { FunctionDefinition } from "@langchain/core/language_models/base";
export default {
  name: "extractor",
  description:
    "Proceed ste by step. From the medication record, extract the following information. If it is not a medication record, mark it as isMedication as false.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      isPrescription: {
        type: "boolean",
        description:
          "Is it a prescription record? true/false. If it is not a prescription record, ignore the rest of the parameters.",
      },
      prescriptions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "The name of the medication. If the medication is a combination of multiple medications, list all the medications in the combination.",
            },
            dosage: {
              type: "string",
              description:
                "Analyze the provided data for the medication and extract the dosage of the medication add appropriate units (tablet, mg, ml) units.",
            },
            route: {
              type: "string",
              enum: [
                "oral",
                "sublingual",
                "nasal",
                "inhalation",
                "topical",
                "transdermal",
                "rectal",
                "intravenous",
                "intramascular",
                "subcutaneous",
              ],
              description: "The route of administration of the medication",
            },
            form: {
              type: "string",
              enum: [
                "tablet",
                "capsule",
                "subligual",
                "liquid",
                "inhaler",
                "spray",
                "topical",
                "patch",
                "injection",
                "suppository",
              ],
              description: "The form of the medication",
            },
            days: {
              type: "number",
              description:
                "Number of days the medication should be taken. If the medication should be taken until finished, set to 0. If no relevant information is available, set to -1.",
            },
            days_of_week: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ],
              },
              description:
                "The days of the week the medication should be taken",
            },
            times_per_day: {
              type: "number",
              description:
                "The number of times per day the medication should be taken. If no relevant information is available, set to -1.",
            },
            time_of_day: {
              type: "array",
              items: {
                type: "string",
                description:
                  "The time of day the medication should be taken in HH:MM. If no relevant information is available, set to 'anytime'.",
              },
              description: "The times of day the medication should be taken.",
            },
            notes: {
              type: "string",
              description:
                "Additional notes and instructions about the medication. If no relevant information is available, leave empty. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
          },
          required: [
            "name",
            "dosage",
            "route",
            "form",
            "days",
            "days_of_week",
            "times_per_day",
            "time_of_day",
          ],
        },
      },
    },
    required: ["isPrescription", "prescriptions"],
  },
} as FunctionDefinition;
