import type { FunctionDefinition } from "@langchain/core/language_models/base";
export default {
  name: "extractor",
  description:
    "You are a professional medical assistant with deep clinical knowledge like Doctor House, specialized in diagnostic reasoning and clinical decision support. Your input is a JSON with doctor/patient conversation and extracted symptoms. Your task is to: 1) Extract any diagnosis, treatment, medication mentioned by the doctor and suggest relevant alternatives, 2) Generate strategic clarifying questions that fill critical information gaps and guide optimal clinical decision-making, 3) Provide actionable recommendations for the doctor's next steps. All information mentioned by the doctor should have origin set to DOCTOR. Suggestions and alternatives based on context should set origin as SUGGESTION. Provide all answers in [LANGUAGE] language.\n\nCRITICAL: ONLY extract diagnoses and clinical values explicitly stated in the conversation. Do NOT fabricate clinical values or infer diagnoses not discussed.",
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
            rationale: {
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
            "rationale",
          ],
        },
      },
      treatment: {
        description:
          "Treatment plan suggestions with evidence and alternatives. Extract any treatment plan mentioned by the doctor and mark origin as DOCTOR. Provide additional treatment alternatives for consideration and mark as SUGGESTION. Provide answer in [LANGUAGE] language.",
        type: "array",
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description:
                "The description of the treatment or counter measures. Provide answer in [LANGUAGE] language.",
            },
            origin: {
              type: "string",
              description:
                "The origin of the treatment. Select Doctor only if the doctor explicitly mentioned this treatment in conversation, otherwise select suggestion. Provide answer in [LANGUAGE] language.",
              enum: ["suggestion", "doctor"],
            },
            targetDiagnosis: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Which diagnoses this treatment addresses. Provide answers in [LANGUAGE] language.",
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
        description:
          "Follow-up recommendations including tests, specialist visits, and monitoring requirements. Based on the diagnosis and treatment plan, recommend specific next steps. Provide answers in [LANGUAGE] language.",
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["test", "doctor", "monitoring", "imaging"],
              description: "The type of follow up recommendation",
            },
            name: {
              type: "string",
              description:
                "The name of the follow up recommendation. Provide answer in [LANGUAGE] language.",
            },
            reason: {
              type: "string",
              description:
                "The reason for the follow up recommendation. Provide answer in [LANGUAGE] language.",
            },
            origin: {
              type: "string",
              description:
                "The origin of the follow up. Select Doctor only if the doctor explicitly mentioned this follow up in conversation, otherwise select suggestion. Provide answer in [LANGUAGE] language.",
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
      medication: {
        type: "array",
        description:
          "Medication recommendations with detailed dosing and alternatives. If medication was mentioned by the doctor, mark as DOCTOR. Provide additional medication suggestions and alternatives and mark as SUGGESTION. Provide answer in [LANGUAGE] language.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "The name of the medication. Provide answer in [LANGUAGE] language.",
            },
            dosage: {
              type: "number",
              description: "The dosage of the medication in mg units.",
            },
            days: {
              type: "string",
              enum: [
                "1-3 days",
                "3-5 days",
                "5-7 days",
                "7-10 days",
                "10-14 days",
                "long-term",
              ],
              description: "The duration the medication should be taken",
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
            time_of_day: {
              type: "string",
              description:
                "The time of day the medication should be taken. Provide answer in [LANGUAGE] language.",
            },
            origin: {
              type: "string",
              description:
                "The origin of the medication. Select Doctor only if the doctor explicitly mentioned this medication in conversation, otherwise select suggestion. Provide answer in [LANGUAGE] language.",
              enum: ["suggestion", "doctor"],
            },
            purpose: {
              type: "string",
              description:
                "What condition or symptom this medication addresses. Provide answer in [LANGUAGE] language.",
            },
            alternatives: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Alternative medications if this one is not available or suitable. Provide answers in [LANGUAGE] language.",
            },
          },
          required: [
            "name",
            "dosage",
            "days",
            "days_of_week",
            "time_of_day",
            "origin",
            "purpose",
          ],
        },
      },
      clarifyingQuestions: {
        type: "array",
        description:
          "ENHANCED: Generate strategic clarifying questions that address critical information gaps in the diagnostic process. Focus on questions that: 1) Help differentiate between similar diagnoses, 2) Identify red flags or contraindications, 3) Clarify symptom characteristics (onset, duration, triggers, severity), 4) Explore relevant medical history and risk factors, 5) Assess treatment response and medication effectiveness. Prioritize questions with the highest diagnostic yield - those most likely to change clinical management. Generate 3-7 high-impact questions, avoiding redundant or low-value inquiries. Provide all questions in [LANGUAGE] language.",
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description:
                "The specific question to ask the patient. Should be clear, concise, and clinically relevant. Use open-ended questions for symptom exploration and closed-ended for specific facts. Examples: 'Can you describe exactly how the pain feels?' or 'Have you ever had chest surgery?' Provide in [LANGUAGE] language.",
            },
            category: {
              type: "string",
              enum: [
                "symptom_characterization",
                "differential_diagnosis",
                "risk_assessment",
                "treatment_response",
                "medication_history",
                "social_history",
                "family_history",
                "review_of_systems",
                "physical_examination",
                "emergency_assessment",
              ],
              description:
                "ENHANCED: More specific categories for clinical context. Symptom characterization explores details of presenting complaints. Differential diagnosis helps distinguish between similar conditions. Risk assessment identifies contraindications or complications.",
            },
            intent: {
              type: "string",
              enum: [
                "rule_out_emergency",
                "differentiate_diagnoses",
                "confirm_hypothesis",
                "assess_severity",
                "identify_triggers",
                "evaluate_progression",
                "screen_contraindications",
                "assess_compliance",
                "gather_context",
                "validate_treatment",
              ],
              description:
                "ENHANCED: More specific clinical intents. Rule out emergency addresses immediate safety. Differentiate diagnoses helps choose between competing hypotheses. Assess severity determines urgency and treatment intensity.",
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              description:
                "ENHANCED: Added 'critical' for emergency assessment questions. Critical: immediate safety/red flags. High: significant diagnostic/therapeutic impact. Medium: helpful context. Low: nice-to-know information.",
            },
            relatedItems: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Which specific diagnoses, treatments, or medications this question relates to. Include ICD-10 codes if relevant. Provide in [LANGUAGE] language.",
            },
            rationale: {
              type: "string",
              description:
                "ENHANCED: Explain the clinical reasoning - why this question is important and how different answers would influence diagnosis or treatment decisions. Include what clinical findings it helps confirm or exclude. Provide in [LANGUAGE] language.",
            },
            expectedAnswers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  answer: {
                    type: "string",
                    description:
                      "Possible patient response - be specific and realistic",
                  },
                  implication: {
                    type: "string",
                    description:
                      "ENHANCED: What this answer would suggest clinically - include diagnostic likelihood changes, treatment modifications, or urgency assessments",
                  },
                  nextSteps: {
                    type: "string",
                    description:
                      "What clinical actions this answer would trigger - additional questions, tests, treatments, or referrals",
                  },
                },
              },
              description:
                "ENHANCED: Possible answers with clinical implications and recommended next steps",
            },
            clinicalPearl: {
              type: "string",
              description:
                "NEW: A brief clinical insight or teaching point related to this question - why it's diagnostically valuable or what pitfalls to avoid. Provide in [LANGUAGE] language.",
            },
            timeframe: {
              type: "string",
              enum: [
                "immediate",
                "same_visit",
                "follow_up",
                "ongoing_monitoring",
              ],
              description:
                "NEW: When this question should be asked - immediate for urgent concerns, same visit for routine assessment, follow-up for treatment response evaluation.",
            },
          },
          required: [
            "question",
            "category",
            "intent",
            "priority",
            "relatedItems",
            "rationale",
            "timeframe",
          ],
        },
      },
      doctorRecommendations: {
        type: "array",
        description:
          "High-level strategic recommendations for the doctor's next steps in this consultation. Focus on clinical decision-making, patient safety, and optimal care pathways. Provide in [LANGUAGE] language.",
        items: {
          type: "object",
          properties: {
            recommendation: {
              type: "string",
              description:
                "The specific recommendation for the doctor. Provide in [LANGUAGE] language.",
            },
            type: {
              type: "string",
              enum: [
                "immediate_action",
                "investigation",
                "referral",
                "monitoring",
                "patient_education",
                "safety_concern",
              ],
              description: "The type of recommendation",
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              description: "The priority level of this recommendation",
            },
            rationale: {
              type: "string",
              description:
                "The clinical reasoning behind this recommendation. Provide in [LANGUAGE] language.",
            },
            timeframe: {
              type: "string",
              enum: [
                "immediate",
                "today",
                "within_week",
                "within_month",
                "routine",
              ],
              description: "When this recommendation should be acted upon",
            },
          },
          required: [
            "recommendation",
            "type",
            "priority",
            "rationale",
            "timeframe",
          ],
        },
      },
      signals: {
        type: "array",
        description: "PLACEHOLDER - will be extended with core Signal schemas",
        items: {
          type: "string",
        },
      },
    },
    required: [
      "signals",
      "diagnosis",
      "treatment",
      "followUp",
      "medication",
      "clarifyingQuestions",
      "doctorRecommendations",
    ],
  },
} as FunctionDefinition;
