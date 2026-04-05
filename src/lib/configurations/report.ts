import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreDiagnosis from "./core.diagnosis";
import coreBodyParts from "./core.bodyParts";
import corePerformer from "./core.performer";
import corePatient from "./core.patient";

/**
 * Core Medical Report Schema
 *
 * Main medical analysis schema that extracts core medical information
 * from any medical document. Reuses core components to avoid duplication.
 */
export default {
  name: "extract_medical_report",
  description:
    "Extract core medical information from any medical document including summary, diagnosis, performer, patient, and body parts. This is the primary medical analysis that runs for all medical documents.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description:
          "Select proper subclassfication of the nature of the report. If the report is not in the list, use general. Laboratory is for lab results, vital-signs for vital signs reports, imaging for medical imaging reports, exam for medical examination reports (probably most GP reports), procedure for medical procedure reports like surgery etc., medication for medication reports, social-history for social history reports, survey for survey reports, therapy for physio therapy and rehabilitation reports, activity for activity reports, other for other reports.",
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
          "Title of the observation.  Provide specific context from the report to clearly identify the issues and topic of the report and ideally the most affected boty part or specialization. Use concise and clear language to describe the report subject. Translate result to the [LANGUAGE] language if the source is in a different language.",
      },
      summary: {
        type: "string",
        description:
          "Summary and findings of the observation in natural language.  Enhance comprehension by providing a clear and concise summary. Expand all abbreviations and acronyms. Highlight abnormal findings. Leave out patient personal information - leave just summary of the diagnosis and treatment. Use markdown format to empahises important findings. Translate result to the [LANGUAGE] language if the source is in a different language.",
      },
      content: {
        type: "string",
        description:
          "Text content of the observation in markdown format exluding the headings and footers, patient and performer information. Is is an OCR input, there might be words, that are not recognized correctly. Respect the original formatting. Create a nice document looking document format that is easily readable with paragraphs, bullet points, and tables. Use bold to empahisze important segments of text. Identify headings and mark them as headings. Remove patient or performer identification blocks and any other irrelevant information. Leave just the contents of the report. Keep the original language of the report.",
      },

      localizedContent: {
        type: "string",
        description:
          "Take the output for the content property and translate the content to [LANGUAGE] language.",
      },
      recommendations: {
        type: "array",
        description:
          "Recommendation contained within the the report spit into individual logical points (if none leave blank array). Translate result to the [LANGUAGE] language if the source is in a different language.",
        items: {
          type: "object",
          properties: {
            urgency: {
              type: "number",
              description:
                "On a scale 1-5, how urgent is the recommendation. 1 - not urgent, just FYI, 5 - very urgent - one needs to act. Where level 2 is easily ignorable, but from 3 up, we want to make sure it is not missed.",
            },
            description: {
              type: "string",
              description:
                "A record for each individual recommendation contained within the the report. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
          },
          required: ["urgency", "description"],
        },
      },
      date: {
        type: "string",
        description:
          "Date of the report. Format: YYYY-MM-DD HH:MM:SS or just YYYY-MM-DD if no specific time is available. Leave empty if the date is not available.",
      },

      // Core medical components - reuse shared schemas
      diagnosis: coreDiagnosis,
      bodyParts: coreBodyParts,
      performer: corePerformer,
      patient: corePatient,

      // Core medical flags for other nodes
      isMedical: {
        type: "boolean",
        description: "Is this a medical document?",
      },

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in medical report extraction (0-1)",
      },
    },
    required: [
      "category",
      "title",
      "summary",
      "content",
      "date",
      "performer",
      "patient",
      "bodyParts",
      "diagnosis",
      "isMedical",
    ],
  },
} as FunctionDefinition;
