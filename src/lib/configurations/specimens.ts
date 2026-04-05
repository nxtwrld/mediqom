import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreBodyParts from "./core.bodyParts";
import coreDiagnosis from "./core.diagnosis";
import corePerformer from "./core.performer";

/**
 * Specimens Schema
 *
 * Extracts specimen collection, handling, and basic examination information.
 * Directly embeds core schemas for proper data structure consistency.
 */
export default {
  name: "extract_specimen_information",
  description:
    "Extract all specimen collection, handling, and examination information from pathology reports or surgical documents.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasSpecimens: {
        type: "boolean",
        description: "Does this document contain specimen information?",
      },
      specimens: {
        type: "array",
        description: "List of all specimens mentioned in the document",
        items: {
          type: "object",
          properties: {
            specimenId: {
              type: "string",
              description:
                "Specimen identifier or label (e.g., 'A', 'B', 'S21-12345')",
            },
            specimenType: {
              type: "string",
              description:
                "Type of specimen (e.g., biopsy, resection, fluid, cytology)",
              enum: [
                "biopsy",
                "excision",
                "resection",
                "fluid",
                "cytology",
                "frozen_section",
                "bone_marrow",
                "blood",
                "urine",
                "other",
              ],
            },
            description: {
              type: "string",
              description:
                "Description of the specimen. Translate to [LANGUAGE] if needed.",
            },
            // Directly embed the core.bodyParts schema structure for anatomical source
            affectedBodyParts: coreBodyParts,
            laterality: {
              type: "string",
              enum: ["left", "right", "bilateral", "midline", "not_specified"],
              description: "Side of body if applicable",
            },
            collectionMethod: {
              type: "string",
              description:
                "How specimen was collected (e.g., needle biopsy, surgical excision)",
            },
            collectionDate: {
              type: "string",
              description: "Date of collection (ISO format)",
            },
            collectionTime: {
              type: "string",
              description: "Time of collection if specified",
            },
            clinicalHistory: {
              type: "string",
              description: "Relevant clinical history provided with specimen. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            previousBiopsy: {
              type: "boolean",
              description: "Whether there was a previous biopsy of this site",
            },
            quantity: {
              type: "object",
              properties: {
                count: {
                  type: "number",
                  description: "Number of specimens/fragments. ONLY populate if explicitly stated in the document.",
                },
                size: {
                  type: "string",
                  description: "Size measurements (e.g., '2.5 x 1.5 x 0.8 cm')",
                },
                weight: {
                  type: "string",
                  description: "Weight if specified (e.g., '15.2 g'). ONLY populate if explicitly stated in the document.",
                },
                volume: {
                  type: "string",
                  description: "Volume for fluids (e.g., '50 ml'). ONLY populate if explicitly stated in the document.",
                },
              },
            },
            grossDescription: {
              type: "string",
              description: "Gross/macroscopic description of specimen",
            },
            processingNotes: {
              type: "array",
              description: "Special processing or handling notes",
              items: {
                type: "string",
              },
            },
            relatedProcedure: {
              type: "object",
              description: "Surgical procedure that produced this specimen",
              properties: {
                procedureName: {
                  type: "string",
                  description: "Name of procedure",
                },
                procedureDate: {
                  type: "string",
                  description: "Date of procedure",
                },
                // Embed core.performer for surgeon information
                surgeon: corePerformer,
              },
            },
            // Embed core.performer for pathologist information
            pathologist: corePerformer,
            frozenSectionRequested: {
              type: "boolean",
              description: "Whether frozen section analysis was requested",
            },
            specialRequests: {
              type: "array",
              description: "Special stains or tests requested",
              items: {
                type: "string",
              },
            },
          },
          required: ["specimenId", "specimenType", "description"],
        },
      },
      totalSpecimenCount: {
        type: "number",
        description: "Total number of specimens in this case",
      },
      specimenAdequacy: {
        type: "string",
        enum: ["adequate", "marginal", "inadequate", "not_assessed"],
        description: "Overall specimen adequacy for diagnosis",
      },
      clinicalIndication: {
        type: "string",
        description: "Clinical indication for specimen collection",
      },
      // Directly embed core.diagnosis schema
      provisionalDiagnosis: coreDiagnosis,
    },
    required: ["hasSpecimens"],
  },
} as FunctionDefinition;
