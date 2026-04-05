import type { FunctionDefinition } from "@langchain/core/language_models/base";

// Base enhanced schema with full clinical detail
const ENHANCED_SCHEMA = {
  name: "extractor",
  description:
    "You are a professional medical assistant with deep knowledge like Doctor House. Your input is a JSON with doctor/patient conversation and extracted symptoms. Your task is to: 1) Extract any diagnosis, treatment, medication mentioned by the doctor and suggest relevant alternatives, 2) Generate clarifying questions that could help confirm or reject diagnoses, refine treatment plans, and optimize medication choices, 3) Provide actionable recommendations for the doctor's next steps. All information mentioned by the doctor should have origin set to DOCTOR. Suggestions and alternatives based on context should set origin as SUGGESTION. Provide all answers in [LANGUAGE] language.\n\nCRITICAL: ONLY extract diagnoses and clinical values explicitly stated in the conversation. Do NOT fabricate clinical values or infer diagnoses not discussed.",
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
          "Generate strategic clarifying questions that address critical information gaps in the diagnostic process. Focus on questions that: 1) Help differentiate between similar diagnoses, 2) Identify red flags or contraindications, 3) Clarify symptom characteristics (onset, duration, triggers, severity), 4) Explore relevant medical history and risk factors, 5) Assess treatment response and medication effectiveness. Prioritize questions with the highest diagnostic yield - those most likely to change clinical management. Generate 3-7 high-impact questions, avoiding redundant or low-value inquiries. Provide all questions in [LANGUAGE] language.",
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description:
                "The specific question to ask the patient. Should be clear, concise, and clinically relevant. Use open-ended questions for symptom exploration ('Can you describe exactly how the pain feels?') and closed-ended for specific facts ('Have you ever had chest surgery?'). Focus on diagnostic yield - questions that significantly change differential diagnosis or treatment decisions. Provide in [LANGUAGE] language.",
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
                "More specific categories for clinical context. Symptom_characterization explores details of presenting complaints. Differential_diagnosis helps distinguish between similar conditions. Risk_assessment identifies contraindications or complications. Emergency_assessment focuses on red flags requiring immediate attention.",
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
                "More specific clinical intents. Rule_out_emergency addresses immediate safety concerns. Differentiate_diagnoses helps choose between competing hypotheses. Assess_severity determines urgency and treatment intensity. Screen_contraindications identifies safety concerns before treatment.",
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              description:
                "Added 'critical' for emergency assessment questions. Critical: immediate safety/red flags requiring urgent action. High: significant diagnostic/therapeutic impact. Medium: helpful context for decision-making. Low: nice-to-know information.",
            },
            relatedItems: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Which specific diagnoses, treatments, or medications this question relates to. Include ICD-10 codes when relevant. Be specific about the clinical connection. Provide in [LANGUAGE] language.",
            },
            rationale: {
              type: "string",
              description:
                "Explain the clinical reasoning - why this question is important and how different answers would influence diagnosis or treatment decisions. Include what clinical findings it helps confirm or exclude and the diagnostic yield expected. Provide in [LANGUAGE] language.",
            },
            expectedAnswers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  answer: {
                    type: "string",
                    description:
                      "Possible patient response - be specific and realistic based on clinical experience",
                  },
                  implication: {
                    type: "string",
                    description:
                      "What this answer would suggest clinically - include diagnostic likelihood changes, treatment modifications, urgency assessments, or additional testing needs",
                  },
                  nextSteps: {
                    type: "string",
                    description:
                      "What clinical actions this answer would trigger - additional questions, diagnostic tests, treatments, referrals, or safety measures",
                  },
                },
              },
              description:
                "Possible answers with detailed clinical implications and recommended next steps for each response",
            },
            clinicalPearl: {
              type: "string",
              description:
                "A brief clinical insight or teaching point related to this question - why it's diagnostically valuable, what it reveals about the condition, or what clinical pitfalls to avoid. Provide in [LANGUAGE] language.",
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
                "When this question should be asked. Immediate: urgent concerns requiring immediate assessment. Same_visit: routine evaluation during current consultation. Follow_up: assessment at next appointment. Ongoing_monitoring: regular evaluation over time.",
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
          "Generate high-level clinical recommendations and guidance for healthcare providers managing this case. Focus on clinical decision-making, care coordination, safety considerations, and next steps in patient management. These should complement the treatment plan with broader clinical insights and professional guidance. Provide 3-6 actionable recommendations prioritized by clinical importance. Provide all recommendations in [LANGUAGE] language.",
        items: {
          type: "object",
          properties: {
            recommendation: {
              type: "string",
              description:
                "Clear, actionable clinical recommendation for healthcare providers. Should be specific enough to guide clinical decision-making while being practical to implement. Focus on high-impact actions that improve patient outcomes, safety, or care coordination. Examples: 'Consider cardiology referral if chest pain persists despite initial treatment' or 'Monitor for signs of treatment resistance and adjust therapy accordingly'. Provide in [LANGUAGE] language.",
            },
            category: {
              type: "string",
              enum: [
                "diagnostic_workup",
                "treatment_modification",
                "monitoring_surveillance",
                "referral_coordination",
                "safety_measures",
                "patient_education",
                "follow_up_planning",
                "emergency_protocols",
              ],
              description:
                "Enhanced categories for clinical recommendations. Diagnostic_workup includes additional testing or evaluation needs. Treatment_modification covers therapy adjustments or alternatives. Monitoring_surveillance involves ongoing assessment strategies. Emergency_protocols address urgent care considerations.",
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              description:
                "Added 'critical' priority for urgent clinical actions. Critical: immediate safety concerns or urgent interventions required. High: significant impact on patient outcomes or safety. Medium: important for optimal care quality. Low: beneficial but not essential actions.",
            },
            timeframe: {
              type: "string",
              enum: [
                "immediate",
                "within_24h",
                "within_week",
                "within_month",
                "ongoing",
              ],
              description:
                "When this recommendation should be implemented. Immediate: urgent action needed now. Within_24h: implement before next day. Within_week: schedule within 7 days. Within_month: plan within 4 weeks. Ongoing: continuous or regular implementation.",
            },
            rationale: {
              type: "string",
              description:
                "Clinical reasoning behind this recommendation. Explain the evidence base, potential benefits, risk-benefit analysis, and why this action is important for this specific case. Include relevant clinical guidelines, contraindications, or special considerations. Provide in [LANGUAGE] language.",
            },
            implementation: {
              type: "string",
              description:
                "Specific guidance on how to implement this recommendation. Include practical steps, required resources, coordination needs, documentation requirements, or communication strategies. Be specific about who should do what and when. Provide in [LANGUAGE] language.",
            },
            expectedOutcome: {
              type: "string",
              description:
                "What outcomes or improvements are expected from following this recommendation. Include clinical benefits, safety improvements, quality metrics, or patient experience enhancements. Describe measurable results when possible. Provide in [LANGUAGE] language.",
            },
            alternatives: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Alternative approaches if the primary recommendation is not feasible. Include backup options, modified approaches, or contingency plans. Consider resource limitations, patient preferences, or clinical contraindications. Provide in [LANGUAGE] language.",
            },
          },
          required: [
            "recommendation",
            "category",
            "priority",
            "timeframe",
            "rationale",
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
};

// Configuration variants for A/B testing
export const DIAGNOSIS_CONFIGS = {
  // Current enhanced version with detailed clinical structure
  enhanced: ENHANCED_SCHEMA,

  // Simplified version focused on core functionality
  simple: {
    name: "medical_conversation_analysis_simple",
    description:
      "Analyze medical conversation and provide basic diagnosis, treatment, and clarifying questions",
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
                description:
                  "Expected effectiveness of this treatment approach",
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
            "Generate 3-5 important clarifying questions to better understand the patient's condition. Focus on key symptoms, medical history, and diagnostic differentiation. Provide all questions in [LANGUAGE] language.",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description:
                  "A clear, important question for the patient. Provide in [LANGUAGE] language.",
              },
              category: {
                type: "string",
                enum: ["symptoms", "history", "examination", "differential"],
                description: "Question category for organization",
              },
              priority: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "Importance level of this question",
              },
            },
            required: ["question", "category", "priority"],
          },
        },
        doctorRecommendations: {
          type: "array",
          description:
            "Provide 2-4 key recommendations for the healthcare provider. Focus on next steps, safety, and care coordination. Provide all recommendations in [LANGUAGE] language.",
          items: {
            type: "object",
            properties: {
              recommendation: {
                type: "string",
                description:
                  "Clear recommendation for the healthcare provider. Provide in [LANGUAGE] language.",
              },
              type: {
                type: "string",
                enum: [
                  "immediate_action",
                  "investigation",
                  "referral",
                  "monitoring",
                  "patient_education",
                ],
                description: "Type of recommendation",
              },
              priority: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "Importance level",
              },
            },
            required: ["recommendation", "type", "priority"],
          },
        },
      },
    },
  },

  // Fast version with minimal structure for speed testing
  fast: {
    name: "medical_conversation_analysis_fast",
    description:
      "Quick medical conversation analysis focusing on essential diagnostic and treatment information",
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
                description:
                  "Expected effectiveness of this treatment approach",
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
            "Generate 2-3 essential clarifying questions. Provide in [LANGUAGE] language.",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description:
                  "Essential question for the patient. Provide in [LANGUAGE] language.",
              },
              priority: {
                type: "string",
                enum: ["high", "medium"],
                description: "Question importance",
              },
            },
            required: ["question", "priority"],
          },
        },
        doctorRecommendations: {
          type: "array",
          description:
            "Provide 1-3 key next steps for the healthcare provider. Provide in [LANGUAGE] language.",
          items: {
            type: "object",
            properties: {
              recommendation: {
                type: "string",
                description:
                  "Key recommendation. Provide in [LANGUAGE] language.",
              },
              type: {
                type: "string",
                enum: ["action", "investigation", "referral"],
                description: "Recommendation type",
              },
            },
            required: ["recommendation", "type"],
          },
        },
        signals: {
          type: "array",
          description:
            "PLACEHOLDER - will be extended with core Signal schemas",
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
  },
};

// Default export for current usage
export default ENHANCED_SCHEMA;
