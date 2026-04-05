export default {
  type: "object",
  description:
    "Patient demographic and identification information.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  properties: {
    fullName: {
      type: "string",
      description: "Name of the patient without.",
    },
    biologicalSex: {
      type: "string",
      description:
        "Biological sex if available. If not available, leave empty.",
      enum: ["male", "female"],
    },
    identifier: {
      type: "string",
      description: "Identifier of the patient.",
    },
    birthDate: {
      type: "string",
      description:
        "Date of birth of the patient. Format: YYYY-MM-DD. Leave empty if the date is not available.",
    },
    insurance: {
      type: "object",
      description:
        "Insurance information of the patient. Leave empty if the insurance information is not available.",
      properties: {
        provider: {
          type: "string",
          description: "Name or numeric code of the insurance company.",
        },
        number: {
          type: "string",
          description: "Policy number of the insurance.",
        },
      },
    },
  },
  required: ["fullName", "identifier"],
};
