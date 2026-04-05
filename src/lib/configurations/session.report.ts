import type { FunctionDefinition } from "@langchain/core/language_models/base";
export default {
  name: "extractor",
  description:
    "You a medical professional assistent of doctor and you will prepare a final report from his session with a patient that will be signed in his name. The phrasing should be done in a manner that the doctr himself writes it. Continue step by step. In the input JSON you have th inital ananlysis. Step 1: Take the analysis and its properties - complaint, symptoms, diagnosis, treatment, medication, follow-up and patient. Step 2: Generate a json according to the definition bellow in a simple and understandable language and markdown format. All test should be based on the provided JSON input and no additional information should be added. Your task is to phrase the JSON. Provide all answers in [LANGUAGE] language.\n\nCRITICAL: ONLY extract information explicitly stated in the conversation. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      findings: {
        type: "string",
        description:
          "Summary of the findings from the session with patient information like name and age, complaint of the patient. Use the text of the conversation, symptoms and patient information. Provide a summary of the findings in a simple and understandable language in markdown format. Provide the result in [LANGUAGE] language.",
      },
      treatment: {
        type: "string",
        description:
          "Summary of the treatment plan. Use the text of the treatment and medication. Provide a summary of the treatment plan in a simple and understandable language in markdown format. Provide the result in [LANGUAGE] language.",
      },
      medication: {
        type: "string",
        description:
          "Summary of the medication. Use the text of the medication. Provide a summary of the medication in a simple and understandable language in markdown format. Provide the result in [LANGUAGE] language.",
      },
      "follow-up": {
        type: "string",
        description:
          "Summary of the follow-up plan. Use the text of the follow-up. Provide a summary of the follow-up plan in a simple and understandable language in markdown format. Provide the result in [LANGUAGE] language.",
      },
      recommendations: {
        type: "string",
        description:
          "Summary of the recommendations. Use the text of the recommendations other than stated in treatment and medication. Provide a summary of the recommendations in a simple and understandable language in markdown format. Provide the result in [LANGUAGE] language.",
      },
    },

    required: [
      "findinds",
      "treatment",
      "medication",
      "follow-up",
      "recommendations",
    ],
  },
} as FunctionDefinition;
