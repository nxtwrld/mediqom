import type { FunctionDefinition } from "@langchain/core/language_models/base";
export default {
  name: "extractor",
  description:
    "Proceed ste by step. From the medication record, extract the following information. If it contains an immunization record, mark isImmunization as true/false.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      isImmunization: {
        type: "boolean",
        description:
          "Is it an immunization record? true/false. If it is not an immunization record, ignore the rest of the parameters.",
      },
      immunizations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the vaccine",
            },
            date: {
              type: "string",
              description:
                "Date of the immunization. Format: YYYY-MM-DD HH:MM:SS. Leave empty if the date is not available.",
            },
            dosage: {
              type: "number",
              description:
                "The dosage of the vaccine in mg units. Leave empty if the dosage is not available.",
            },
            expiration: {
              type: "string",
              description:
                "Expiration date of the vaccine. Format: YYYY-MM-DD HH:MM:SS. Leave empty if the date is not available.",
            },
            disease: {
              type: "string",
              description: "The disease the vaccine is for.",
            },
            manufacturer: {
              type: "string",
              description:
                "The manufacturer of the vaccine. If the manufacturer is not available, leave empty.",
            },
            category: {
              type: "string",
              description: "Higher level immunization group.",
              enum: [
                "Influenza",
                "COVID-19 Vaccine",
                "Hepatitis A",
                "Hepatitis B",
                "MMR (Measles, Mumps, Rubella)",
                "Tetanus",
                "Diphtheria",
                "Varicella (Chickenpox)",
                "HPV (Human Papillomavirus)",
                "Meningococcal",
                "Pneumococcal",
                "Zoster (Shingles)",
                "Yellow Fever",
                "Typhoid Fever",
                "Rabies",
                "Japanese Encephalitis",
                "Cholera",
                "Rotavirus",
                "Polio (IPV)",
                "Hib (Haemophilus Influenzae Type b)",
                "DTaP (Diphtheria, Tetanus, Pertussis)",
                "Tdap (Tetanus, Diphtheria, Pertussis) booster",
                "Measles",
                "Mumps",
                "Rubella",
                "BCG (Bacillus Calmette-Guérin)",
                "Tick-borne Encephalitis",
                "Meningococcal B",
                "ACWY Meningococcal",
                "Hepatitis A and Typhoid combination",
                "Rabies (Pre-exposure)",
                "HPV9 (Gardasil 9)",
                "Adenovirus",
                "Anthrax",
                "Smallpox",
                "Vaccinia (Smallpox and Monkeypox)",
                "Japanese Encephalitis (inactivated)",
                "Oral Cholera",
                "Dengue Fever",
                "Pneumococcal Conjugate (PCV13)",
                "Pneumococcal Polysaccharide (PPSV23)",
                "Rabies (Post-exposure)",
                "Yellow Fever (Stamaril)",
                "Typhoid Oral (Vivotif)",
                "Hepatitis A (Pediatric)",
                "Hepatitis B (Pediatric)",
                "Human Papillomavirus (HPV2, HPV4)",
                "Zika Virus",
                "Malaria (RTS,S/AS01)",
                "Ebola Virus (rVSV-ZEBOV)",
                "Lyme Disease",
                "Rotavirus (Rotarix)",
                "Rotavirus (RotaTeq)",
                "Varicella (Varivax)",
                "Herpes Zoster (Shingrix)",
                "Influenza (High-Dose for Elderly)",
                "Influenza (Quadrivalent)",
              ],
            },
            notes: {
              type: "string",
              description:
                "Additional notes about the immunization. Leave empty if no notes are available. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
          },
          required: ["isImmunization", "name", "date", "category"],
        },
      },
    },
    required: ["isImmunization", "immunizations"],
  },
} as FunctionDefinition;
