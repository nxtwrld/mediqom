import type { FunctionDefinition } from "@langchain/core/language_models/base";

// Streamlined schema focused on diagnosis analysis only
// Signals, medications, and reports are handled by dedicated schemas
const STREAMLINED_SCHEMA = {
  name: "diagnosis_analyzer",
  description:
    "You are a professional medical assistant specializing in diagnosis analysis. Your input is a JSON with doctor/patient conversation and extracted symptoms. Your task is to: 1) Extract any diagnosis mentioned by the doctor, 2) Suggest relevant alternative diagnoses based on symptoms, 3) Generate clarifying questions to help confirm or reject diagnoses, 4) Provide treatment recommendations. All information mentioned by the doctor should have origin set to DOCTOR. Suggestions based on context should set origin as SUGGESTION. Provide all answers in [LANGUAGE] language.\n\nCRITICAL: ONLY extract diagnoses and clinical values explicitly stated in the conversation. Do NOT fabricate clinical values or infer diagnoses not discussed.",
  parameters: {
    type: "object",
    properties: {
      diagnosis: {
        description:
          "A list of possible diagnoses with confidence scores and supporting evidence. Extract diagnoses mentioned by the doctor and mark origin as DOCTOR. Provide additional relevant diagnosis suggestions and mark origin as SUGGESTION. Include confidence scores based on available symptoms and context. Provide answers in [LANGUAGE] language.",
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "The name of the diagnosis. Provide answer in [LANGUAGE] language.",
            },
            code: {
              type: "string",
              description: "The ICD-10 code of the diagnosis",
            },
            origin: {
              type: "string",
              description:
                "The origin of the diagnosis. Select Doctor if the doctor explicitly suggested this diagnosis in the conversation, otherwise select suggestion. Provide answer in [LANGUAGE] language.",
              enum: ["suggestion", "doctor"],
            },
            basis: {
              type: "string",
              description:
                "The supporting symptoms and evidence for this diagnosis. Provide answer in [LANGUAGE] language.",
            },
            probability: {
              type: "number",
              description:
                "The confidence score/probability of the diagnosis (0.0 to 1.0)",
            },
            supportingSymptoms: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "List of specific symptoms that support this diagnosis. Provide answers in [LANGUAGE] language.",
            },
            reasoning: {
              type: "string",
              description:
                "Clinical reasoning for why this diagnosis is considered. Provide answer in [LANGUAGE] language.",
            },
          },
          required: [
            "name",
            "origin",
            "basis",
            "probability",
            "supportingSymptoms",
            "reasoning",
          ],
        },
      },
      treatment: {
        type: "array",
        description:
          "A list of treatment options with detailed information. Extract treatments mentioned by the doctor and mark origin as DOCTOR. Provide additional relevant treatment suggestions and mark origin as SUGGESTION. Include effectiveness ratings and considerations. Provide answers in [LANGUAGE] language.",
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description:
                "Clear description of the treatment approach. Provide answer in [LANGUAGE] language.",
            },
            origin: {
              type: "string",
              description:
                "The origin of the treatment. Select Doctor if the doctor explicitly suggested this treatment in the conversation, otherwise select suggestion. Provide answer in [LANGUAGE] language.",
              enum: ["suggestion", "doctor"],
            },
            targetDiagnosis: {
              type: "string",
              description:
                "Which diagnosis this treatment is targeting. Provide answer in [LANGUAGE] language.",
            },
            effectiveness: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Expected effectiveness of this treatment approach",
            },
          },
          required: [
            "description",
            "origin",
            "targetDiagnosis",
            "effectiveness",
          ],
        },
      },
      followUp: {
        type: "array",
        description:
          "A list of follow-up appointments and actions needed. Extract follow-up plans mentioned by the doctor and mark origin as DOCTOR. Provide additional relevant follow-up suggestions and mark origin as SUGGESTION. Include urgency levels and specific reasons. Provide answers in [LANGUAGE] language.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description:
                "The type of follow-up (appointment, test, specialist referral, etc.). Provide answer in [LANGUAGE] language.",
            },
            name: {
              type: "string",
              description:
                "The name of the follow-up action. Provide answer in [LANGUAGE] language.",
            },
            reason: {
              type: "string",
              description:
                "The reason for this follow-up. Provide answer in [LANGUAGE] language.",
            },
            origin: {
              type: "string",
              description:
                "The origin of the follow-up. Select Doctor if the doctor explicitly suggested this follow-up in the conversation, otherwise select suggestion. Provide answer in [LANGUAGE] language.",
              enum: ["suggestion", "doctor"],
            },
            urgency: {
              type: "string",
              enum: ["immediate", "within_week", "within_month", "routine"],
              description: "The urgency level for this follow-up",
            },
          },
          required: ["type", "name", "reason", "origin", "urgency"],
        },
      },
      clarifyingQuestions: {
        description:
          "Important questions to ask the patient to help confirm or reject diagnoses, refine treatment plans, and gather additional clinical information. Focus on diagnostic clarity and treatment optimization. Provide answers in [LANGUAGE] language.",
        type: "array",
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description:
                "The specific question to ask the patient. Provide answer in [LANGUAGE] language.",
            },
            category: {
              type: "string",
              enum: [
                "symptoms",
                "medical_history",
                "family_history",
                "medications",
                "lifestyle",
                "diagnostic_tests",
                "treatment_response",
                "follow_up",
              ],
              description: "The category of this question",
            },
            intent: {
              type: "string",
              description:
                "Why this question is important and what information it will help clarify. Provide answer in [LANGUAGE] language.",
            },
            priority: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Importance level of this question",
            },
            relatedDiagnosis: {
              type: "string",
              description:
                "Which diagnosis this question is most related to. Provide answer in [LANGUAGE] language.",
            },
          },
          required: [
            "question",
            "category",
            "intent",
            "priority",
            "relatedDiagnosis",
          ],
        },
      },
    },
    required: ["diagnosis", "treatment", "followUp", "clarifyingQuestions"],
  },
};

// Configuration variants for different use cases
export const DIAGNOSIS_CONFIGS = {
  // Streamlined version focused on diagnosis only
  streamlined: STREAMLINED_SCHEMA,

  // Even simpler version for quick analysis
  simple: {
    name: "simple_diagnosis_analyzer",
    description:
      "Analyze medical conversation and provide basic diagnosis and treatment suggestions",
    parameters: {
      type: "object",
      properties: {
        diagnosis: {
          description: "A list of possible diagnoses with confidence scores",
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "The name of the diagnosis",
              },
              code: {
                type: "string",
                description: "The ICD-10 code of the diagnosis",
              },
              origin: {
                type: "string",
                enum: ["suggestion", "doctor"],
                description: "Source of the diagnosis",
              },
              probability: {
                type: "number",
                description: "Confidence score (0.0 to 1.0)",
              },
              basis: {
                type: "string",
                description: "Supporting evidence",
              },
            },
            required: ["name", "origin", "probability", "basis"],
          },
        },
        treatment: {
          type: "array",
          description: "Treatment recommendations",
          items: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description: "Treatment approach",
              },
              origin: {
                type: "string",
                enum: ["suggestion", "doctor"],
                description: "Source of treatment",
              },
              targetDiagnosis: {
                type: "string",
                description: "Which diagnosis this targets",
              },
            },
            required: ["description", "origin", "targetDiagnosis"],
          },
        },
        clarifyingQuestions: {
          type: "array",
          description: "Important questions to ask",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The question to ask",
              },
              priority: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "Question importance",
              },
            },
            required: ["question", "priority"],
          },
        },
      },
      required: ["diagnosis", "treatment", "clarifyingQuestions"],
    },
  },
};

// Export streamlined version as default
export default STREAMLINED_SCHEMA;
