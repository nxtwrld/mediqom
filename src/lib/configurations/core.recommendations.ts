import coreDiagnosis from "./core.diagnosis";
import coreBodyParts from "./core.bodyParts";
import corePerformer from "./core.performer";
import coreSignals from "./core.signals";
import coreTreatmentGoal from "./core.treatmentGoal";

/**
 * Core Recommendations Schema
 *
 * Extracts clinical recommendations, follow-up instructions, and care plans.
 * Directly embeds core schemas for proper data structure consistency.
 */
export default {
  name: "extract_medical_recommendations",
  description:
    "Extract all clinical recommendations, follow-up instructions, care plans, and suggested next steps from the medical document.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      recommendations: {
        type: "array",
        description: "List of all recommendations found in the document",
        items: {
          type: "object",
          properties: {
            recommendation: {
              type: "string",
              description:
                "The specific recommendation or instruction. Translate to [LANGUAGE] if needed.",
            },
            category: {
              type: "string",
              enum: [
                "follow_up",
                "medication",
                "lifestyle",
                "diagnostic_test",
                "referral",
                "monitoring",
                "treatment",
                "prevention",
                "education",
              ],
              description: "Category of the recommendation",
            },
            priority: {
              type: "string",
              enum: ["immediate", "urgent", "routine", "as_needed"],
              description: "Priority level of the recommendation",
            },
            timeframe: {
              type: "string",
              description:
                "Timeframe for the recommendation (e.g., 'in 2 weeks', 'within 48 hours')",
            },
            timeframeNormalized: {
              type: "object",
              description:
                "Normalized duration of the stated timeframe. CRITICAL: ONLY populate when the document explicitly states a timeframe. Never infer a default or typical interval. Omit entirely when no timeframe is stated.",
              properties: {
                unit: {
                  type: "string",
                  enum: ["days", "weeks", "months", "years"],
                  description: "Duration unit of the stated timeframe",
                },
                value: {
                  type: "number",
                  description:
                    "Duration value of the stated timeframe (e.g. 'in 2 weeks' → unit: weeks, value: 2; 'within 48 hours' → unit: days, value: 2)",
                },
              },
              required: ["unit", "value"],
            },
            sourceQuote: {
              type: "string",
              description:
                "Verbatim quote of the sentence(s) in the source document that state this recommendation, in the ORIGINAL document language. CRITICAL: copy exactly — do not paraphrase, translate, or fabricate. Omit entirely if no literal sentence states it.",
            },
            // Directly embed core.performer for the provider who made this recommendation
            sourceProvider: corePerformer,
            linkedCarePlanTaskId: {
              type: "string",
              description:
                "ONLY valid when a Care Plan context block is present in the input: the id of an EXISTING task from that context which this recommendation duplicates (same action, same intent). Copy the id verbatim from the context. Omit when no context is provided or no existing task matches.",
            },
            isNewTask: {
              type: "boolean",
              description:
                "ONLY valid when a Care Plan context block is present in the input: true when this recommendation does not match any existing task in the context. Omit when no context is provided.",
            },
            resolves: {
              type: "array",
              description:
                "ONLY valid when a Care Plan context block is present in the input: ids of existing tasks from that context which THIS DOCUMENT satisfies (e.g. a lab report satisfying a 'get blood test' task). Copy ids verbatim from the context. Omit when no context is provided or nothing is resolved.",
              items: {
                type: "string",
              },
            },
            // Directly embed core.diagnosis schema
            relatedDiagnosis: coreDiagnosis,
            // Directly embed core.bodyParts schema for target body parts
            targetBodyParts: coreBodyParts,
            // Directly embed core.signals schema for monitoring signals
            monitoringSignals: coreSignals,
            // Directly embed core.performer schema for referral provider
            referralTo: {
              type: "object",
              description: "Specialist referral information",
              properties: {
                // Embed core.performer for provider information
                provider: corePerformer,
                urgency: {
                  type: "string",
                  enum: ["emergency", "urgent", "routine"],
                  description: "Referral urgency",
                },
                reason: {
                  type: "string",
                  description: "Reason for referral",
                },
              },
            },
            specificInstructions: {
              type: "array",
              description: "Detailed instructions for this recommendation",
              items: {
                type: "string",
              },
            },
            contraindications: {
              type: "array",
              description: "Things to avoid or contraindications",
              items: {
                type: "string",
              },
            },
          },
          required: ["recommendation", "category", "priority"],
        },
      },
      carePlan: {
        type: "object",
        description: "Overall care plan if provided",
        properties: {
          goals: {
            type: "array",
            description: "Treatment or care goals",
            items: coreTreatmentGoal,
          },
          duration: {
            type: "string",
            description: "Expected duration of care plan",
          },
          reviewDate: {
            type: "string",
            description: "Next review date (ISO format)",
          },
        },
      },
      followUpSchedule: {
        type: "array",
        description: "Scheduled follow-up appointments",
        items: {
          type: "object",
          properties: {
            appointmentType: {
              type: "string",
              description:
                "Type of follow-up (e.g., office visit, imaging, lab work)",
            },
            timeframe: {
              type: "string",
              description: "When to schedule (e.g., '2 weeks', '3 months')",
            },
            timeframeNormalized: {
              type: "object",
              description:
                "Normalized duration of the stated timeframe. CRITICAL: ONLY populate when the document explicitly states a timeframe. Never infer a default or typical interval. Omit entirely when no timeframe is stated.",
              properties: {
                unit: {
                  type: "string",
                  enum: ["days", "weeks", "months", "years"],
                  description: "Duration unit of the stated timeframe",
                },
                value: {
                  type: "number",
                  description: "Duration value of the stated timeframe",
                },
              },
              required: ["unit", "value"],
            },
            sourceQuote: {
              type: "string",
              description:
                "Verbatim quote of the sentence(s) in the source document that schedule this follow-up, in the ORIGINAL document language. CRITICAL: copy exactly — do not paraphrase, translate, or fabricate. Omit entirely if no literal sentence states it.",
            },
            // Directly embed core.performer schema for follow-up provider
            withProvider: corePerformer,
            purpose: {
              type: "string",
              description: "Purpose of the follow-up",
            },
          },
          required: ["appointmentType", "timeframe"],
        },
      },
      patientEducation: {
        type: "array",
        description: "Patient education topics recommended",
        items: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              description: "Education topic",
            },
            resources: {
              type: "array",
              description: "Recommended resources",
              items: {
                type: "string",
              },
            },
          },
        },
      },
      urgentActions: {
        type: "array",
        description: "Urgent or immediate actions required",
        items: {
          type: "string",
          description: "Urgent action item",
        },
      },
    },
    required: ["recommendations"],
  },
};
