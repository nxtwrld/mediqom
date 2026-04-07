import type { FunctionDefinition } from "@langchain/core/language_models/base";
export default {
  name: "extractor",
  description:
    "Proceed step by step. From the dental record, extract the following information. If it is not a dental record, mark it as isDental as false.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description:
          "Select proper subclassfication of the nature of the report. If the report is not in the list, use general.",
        enum: [
          "general",
          "laboratory",
          "vital-signs",
          "imaging",
          "exam",
          "procedure",
          "medication",
          "social-history",
          "survey",
          "therapy",
          "activity",
          "other",
        ],
      },
      title: {
        type: "string",
        description:
          "Title of the observation. Translate result to the [LANGUAGE] language if the source is in a different language. Provide specific context from the report to clearly identify the issues and topic of the report. Use concise and clear language to describe the report subject.",
      },
      summary: {
        type: "string",
        description:
          "Summary and findings of the observation in natural language. Translate result to the [LANGUAGE] language if the source is in a different language. Enhance comprehension by providing a clear and concise summary. Expand all abbreviations and acronyms. Highlight abnormal findings. Leave out patient personal information - leave just summary of the diagnosis and treatment.",
      },
      content: {
        type: "string",
        description:
          "Content of the observation in markdown format exluding the headings and footers, patient and performer information. Respect the original formatting. Create a nice document looking document format that is easily readable with paragraphs, bullet points, and tables. Use bold to empahisze important segments of text. Identify headings and mark them as headings. Remove patient or performer identification blocks and any other irrelevant information. Leave just the contents of the report. Keep the original language of the report.",
      },

      localizedContent: {
        type: "string",
        description:
          "Content of the observation in markdown format exluding the headings and footers, patient and performer information. Respect the original formatting. Create a nice document looking document format that is easily readable with paragraphs, bullet points, and tables. Use bold to empahisze important segments of text. Identify headings and mark them as headings. Remove patient or performer identification blocks and any other irrelevant information. Leave just the contents of the report. Translate the content to [LANGUAGE] language. Keep the original language of the report.",
      },
      bodyParts: {
        type: "array",
        items: {
          type: "object",
          description:
            "Devide the information into individual teeth. If the tooth is missing, leave the information empty.",
          properties: {
            identification: {
              type: "string",
              description:
                "Identification number of the tooth. 1-32. Add prefix tooth- to the number. If the tooth is missing, leave it empty.",
            },
            status: {
              type: "string",
              description:
                "Status of the tooth. If the tooth is missing, leave it empty. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            diagnosis: {
              type: "string",
              description:
                "Diagnosis of the tooth. If the tooth is missing, leave it empty. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            treatment: {
              type: "string",
              description:
                "Treatment of the tooth. If the tooth is missing, leave it empty. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            urgency: {
              type: "number",
              description:
                "Urgency of the report regarding the body part on a scale of 1-5. 1 - not severe, 5 - very severe. where 1 is non issue - just a general statement, 2 and up are issues detected, that need to be reflected upon.",
            },
          },
          required: ["identification", "status", "diagnosis", "treatment"],
        },
      },
      date: {
        type: "string",
        description:
          "Date of the report. Format: YYYY-MM-DD HH:MM:SS. Leave empty if the date is not available.",
      },
    },
    required: [
      "category",
      "observation",
      "title",
      "summary",
      "teeth",
      "performer",
      "patient",
    ],
  },
} as FunctionDefinition;
