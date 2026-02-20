import type { FunctionDefinition } from "@langchain/core/language_models/base";

export const serenityFormExtractionSchema: FunctionDefinition = {
  name: "extract_serenity_observations",
  description:
    "Extract observable patient state indicators from therapist audio observations for SERENITY Therapeutic Assessment",
  parameters: {
    type: "object",
    properties: {
      facialExpression: {
        type: "number",
        enum: [0, 1, 2],
        description:
          "Facial expression observation: 0=Calm/relaxed, 1=Mild grimacing/pursed lips, 2=Marked pain/tension/furrowed brow. Only provide if explicitly mentioned.",
      },
      eyeMovement: {
        type: "number",
        enum: [0, 1, 2],
        description:
          "Eye movement observation: 0=Calm gaze/interested, 1=Occasional darting/uncertainty, 2=Markedly restless/closing eyes/avoiding gaze. Only provide if explicitly mentioned.",
      },
      bodyMovement: {
        type: "number",
        enum: [0, 1, 2],
        description:
          "Body movement/restlessness: 0=Calm/no restlessness, 1=Occasional small movements/hand-foot restlessness, 2=Frequent movements/marked restlessness/muscle tension. Only provide if explicitly mentioned.",
      },
      vocalizationBreathing: {
        type: "number",
        enum: [0, 1, 2],
        description:
          "Vocalization/breathing patterns: 0=Calm breathing/no sounds, 1=Occasional sighs/mild breathing change, 2=Frequent moaning/markedly irregular breathing. Only provide if explicitly mentioned.",
      },
      environmentalEngagement: {
        type: "number",
        enum: [0, 1, 2],
        description:
          "Environmental engagement: 0=Interest/watches screen/responds, 1=Brief attention/occasional disinterest, 2=No response/refusal/turning away. Only provide if explicitly mentioned.",
      },
      confidence: {
        type: "number",
        description: "Confidence in extraction (0.0 to 1.0)",
      },
      unansweredQuestions: {
        type: "array",
        items: { type: "string" },
        description:
          "List of question IDs where no relevant observation was found in the transcript",
      },
      reasoning: {
        type: "string",
        description:
          "Brief explanation of how observations were extracted from the transcript",
      },
    },
    required: ["confidence", "unansweredQuestions"],
  },
};
