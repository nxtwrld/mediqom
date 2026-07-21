/**
 * Core Treatment Goal Schema
 *
 * Shared structured definition for treatment / care goals. Used by:
 *  - treatments.ts (treatmentGoals)
 *  - treatment-plan.ts (treatmentGoals)
 *  - core.recommendations.ts (carePlan.goals)
 *
 * Only `goal` is required. All other fields are optional so the LLM may omit
 * them whenever the source document does not state them — anti-hallucination
 * guards live in each field description.
 *
 * Backwards compatibility: existing extractions may store goals as plain
 * strings. Readers (e.g. SectionTreatmentPlan.svelte, Care Plan merge) must
 * accept both shapes and wrap legacy strings as `{ goal: <string> }`.
 */
import corePerformer from "./core.performer";

export default {
  type: "object",
  description:
    "Structured treatment or care goal. Translate text fields to the [LANGUAGE] language if the source is in a different language.",
  properties: {
    goal: {
      type: "string",
      description:
        "The treatment or care goal as stated in the document. Translate to the [LANGUAGE] language if the source is in a different language.",
    },
    category: {
      type: "string",
      enum: [
        "curative",
        "palliative",
        "symptomatic",
        "preventive",
        "rehabilitative",
      ],
      description:
        "Goal category. ONLY populate if explicitly stated or unambiguous from context.",
    },
    timeline: {
      type: "string",
      description:
        "Expected timeline to achieve the goal (e.g. '3 months', 'by next review'). ONLY populate if explicitly stated in the document.",
    },
    measurableOutcome: {
      type: "string",
      description:
        "Free-text description of how progress will be measured (e.g. 'reduce LDL by 20%', 'return to walking 30 minutes daily'). ONLY populate if explicitly stated in the document.",
    },
    monitoringSignal: {
      type: "string",
      description:
        "Name of a measurable signal tied to this goal (e.g. 'blood_pressure_systolic', 'hba1c'). ONLY populate if the document explicitly ties this goal to a measurable signal.",
    },
    targetValue: {
      type: "number",
      description:
        "Numeric target value for the monitoring signal. ONLY populate if a specific numeric target is explicitly stated in the document (e.g. 'target LDL < 100 mg/dL'). Do NOT infer from general clinical guidelines.",
    },
    targetRange: {
      type: "object",
      description:
        "Numeric target range for the monitoring signal. ONLY populate if the document explicitly states a numeric range (e.g. 'keep HbA1c between 6.5 and 7.0').",
      properties: {
        min: {
          type: "number",
          description: "Lower bound of the target range.",
        },
        max: {
          type: "number",
          description: "Upper bound of the target range.",
        },
      },
      required: ["min", "max"],
    },
    sourceQuote: {
      type: "string",
      description:
        "Verbatim quote of the sentence(s) in the source document that state this goal, in the ORIGINAL document language. CRITICAL: copy exactly — do not paraphrase, translate, or fabricate. Omit entirely if no literal sentence states it.",
    },
    // Embed core.performer for the provider who set this goal
    sourceProvider: corePerformer,
  },
  required: ["goal"],
};
