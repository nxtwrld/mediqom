export default {
  type: "array",
  items: {
    type: "object",
    description:
      "Analyze the document and seek for the affected body parts. Provide information about individual the body parts mentioned in the report.",
    properties: {
      identification: {
        type: "string",
        description:
          "Main body part from 3D model. MUST use lateralized names for paired structures (L_humerus, R_femur, L_patella, etc.). Only select from provided enum items - these are valid 3D model objects. For bilateral findings, create separate entries with L_ and R_ prefixes. Do not create new identification outside the provided list.",
        enum: [],
      },
      part: {
        type: "string",
        description:
          "Specific sub-region or anatomical part of the body part (e.g., cardia, pylorus, fundus for stomach; left lobe, right lobe for liver). Leave empty if the entire organ/body part is referenced without specifying a particular region.",
      },
      status: {
        type: "string",
        description:
          "Observed status of the body part. Translate result to the [LANGUAGE] language if the source is in a different language. Leave is empty if the status is not available in the original report.",
      },
      treatment: {
        type: "string",
        description:
          "Performed or suggested treatment of the body part. Translate result to the [LANGUAGE] language if the source is in a different language. Leave empty if the treatment is not available.",
      },
      urgency: {
        type: "number",
        description:
          "Urgency of the report regarding the body part on a scale of 1-5. 1 - not severe, 5 - very severe. where 1 is non issue - just a general statement, 2 and up are issues detected, that need to be reflected upon.",
      },
    },
    required: ["identification", "status", "urgency"],
  },
};
