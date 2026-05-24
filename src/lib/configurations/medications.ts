import type { FunctionDefinition } from "@langchain/core/language_models/base";
import corePerformer from "./core.performer";

/**
 * Unified Medications Schema
 *
 * Handles both current medications (medication lists, medication reconciliation)
 * and new prescriptions (prescription documents). This unified approach allows
 * the system to process both medication contexts seamlessly.
 */
export default {
  name: "extract_medication_and_prescription_information",
  description:
    "Extract comprehensive medication information including current medications, new prescriptions, dosages, administration instructions, and medication management details. This schema handles both medication lists and prescription documents.\n\nCRITICAL CONSUMER-SAFETY RULE: Medications are doctor-controlled. NEVER infer dose changes, discontinuations, or new prescriptions by comparing across documents or filling in gaps. ONLY extract what is explicitly written by the prescribing provider in this specific document. If the document is silent about a change, the relevant array MUST be empty. Mediqom ships in consumer mode — fabricated medication actions can cause real patient harm. When uncertain, omit the field rather than guess.\n\nCARE PLAN LINK ANNOTATIONS: When the import request includes a CarePlanExtractionContext.recentMedications list (existing medications already known to the user's Care Plan), populate `linkedMedicationId` on currentMedications/discontinuedMedications/medicationChanges items to point to the matching existing medication id, and `isNewMedication: true` on newPrescriptions items that do NOT match any existing medication. Only set a link when you are confident it is the same medication (matching name and/or generic + similar dose context). If no context blob is provided, leave these fields unset.",
  parameters: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        enum: [
          "prescription",
          "medication_list",
          "medication_reconciliation",
          "discharge_medications",
          "both",
        ],
        description: "Type of medication document being processed",
      },
      hasMedications: {
        type: "boolean",
        description: "Does this document contain any medication information?",
      },
      // New prescriptions (from prescription documents)
      newPrescriptions: {
        type: "array",
        description: "New prescriptions being issued",
        items: {
          type: "object",
          properties: {
            medicationName: {
              type: "string",
              description:
                "Complete medication name including strength if specified",
            },
            genericName: {
              type: "string",
              description: "Generic (non-proprietary) name",
            },
            brandName: {
              type: "string",
              description: "Brand/trade name if specified",
            },
            strength: {
              type: "string",
              description:
                "Medication strength (e.g., '500 mg', '10 units/mL')",
            },
            dosage: {
              type: "string",
              description:
                "Individual dose amount with units (tablet, mg, ml, etc.)",
            },
            route: {
              type: "string",
              enum: [
                "oral",
                "sublingual",
                "nasal",
                "inhalation",
                "topical",
                "transdermal",
                "rectal",
                "intravenous",
                "intramuscular",
                "subcutaneous",
                "ophthalmic",
                "otic",
                "vaginal",
                "buccal",
              ],
              description: "Route of administration",
            },
            form: {
              type: "string",
              enum: [
                "tablet",
                "capsule",
                "sublingual",
                "liquid",
                "inhaler",
                "spray",
                "topical",
                "patch",
                "injection",
                "suppository",
                "cream",
                "ointment",
                "gel",
                "drops",
                "powder",
              ],
              description: "Medication formulation/dosage form",
            },
            frequency: {
              type: "object",
              properties: {
                timesPerDay: {
                  type: "number",
                  description: "Number of times per day (-1 if not specified)",
                },
                daysOfWeek: {
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
                  description: "Specific days of the week if applicable",
                },
                timeOfDay: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description:
                    "Specific times (HH:MM format) or 'anytime' if not specified",
                },
                schedule: {
                  type: "string",
                  description:
                    "Human-readable frequency (e.g., 'twice daily', 'every 6 hours'). Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
              },
            },
            duration: {
              type: "object",
              properties: {
                days: {
                  type: "number",
                  description:
                    "Number of days (0 = until finished, -1 = not specified). ONLY populate if explicitly written in the prescription; otherwise use -1.",
                },
                quantity: {
                  type: "string",
                  description:
                    "Total quantity to dispense. ONLY populate if explicitly written in the prescription.",
                },
                refills: {
                  type: "number",
                  description:
                    "Number of refills authorized. ONLY populate if explicitly written in the prescription; otherwise omit.",
                },
                daysSupply: {
                  type: "number",
                  description: "Days supply provided",
                },
              },
            },
            instructions: {
              type: "object",
              properties: {
                administration: {
                  type: "string",
                  description:
                    "Administration instructions (e.g., 'with food', 'on empty stomach'). Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
                specialInstructions: {
                  type: "string",
                  description:
                    "Special instructions or precautions. Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
                asNeeded: {
                  type: "boolean",
                  description: "Is this medication PRN (as needed)?",
                },
                prnIndication: {
                  type: "string",
                  description: "Condition for PRN use. Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
                notes: {
                  type: "string",
                  description:
                    "Additional notes. Translate to [LANGUAGE] if needed.",
                },
              },
            },
            // Expected roles: primary_physician, attending_physician, oncologist, other_specialist
            prescriber: corePerformer,
            indication: {
              type: "string",
              description:
                "Medical indication for prescription. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            prescriptionDate: {
              type: "string",
              description: "Date prescription was written",
            },
            therapeuticClass: {
              type: "array",
              items: { type: "string" },
              description:
                "Therapeutic classes: antibiotic, analgesic, antihypertensive, etc.",
            },
            searchTerms: {
              type: "array",
              items: { type: "string" },
              description:
                "Search-optimized terms: generic names, brand names, drug classes, indications",
            },
            isNewMedication: {
              type: "boolean",
              description:
                "Care Plan link annotation. ONLY set when a CarePlanExtractionContext was provided in the request. Set to true if this prescription does NOT match any medication in CarePlanExtractionContext.recentMedications. Leave unset otherwise.",
            },
          },
          required: ["medicationName", "dosage", "route", "form"],
        },
      },
      // Current medications (from medication lists)
      currentMedications: {
        type: "array",
        description: "Current medications patient is taking",
        items: {
          type: "object",
          properties: {
            medicationName: {
              type: "string",
              description: "Complete medication name",
            },
            genericName: {
              type: "string",
              description: "Generic name",
            },
            brandName: {
              type: "string",
              description: "Brand name",
            },
            strength: {
              type: "string",
              description: "Medication strength",
            },
            dosage: {
              type: "string",
              description:
                "Current dosage with units. ONLY extract the dosage written in THIS document; do NOT carry over from a prior document.",
            },
            route: {
              type: "string",
              description: "Route of administration",
            },
            form: {
              type: "string",
              description: "Medication form",
            },
            frequency: {
              type: "string",
              description: "How often taken. ONLY extract exact text from document. Do NOT infer or guess frequency if not explicitly stated.",
            },
            indication: {
              type: "string",
              description:
                "Why patient is taking this medication. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            status: {
              type: "string",
              enum: [
                "active",
                "completed",
                "discontinued",
                "on_hold",
                "unknown",
              ],
              description:
                "Current status. ONLY use 'discontinued' / 'on_hold' / 'completed' if the document explicitly says so. Default to 'active' for medications listed as current; NEVER infer a non-active status from absence or context.",
            },
            startDate: {
              type: "string",
              description: "When medication was started. ONLY populate if explicitly stated in the document. Leave empty if not mentioned.",
            },
            prescriber: {
              type: "string",
              description: "Prescribing provider",
            },
            lastFilled: {
              type: "string",
              description: "Date last filled. ONLY populate if explicitly stated in the document. Leave empty if not mentioned.",
            },
            adherence: {
              type: "string",
              enum: ["excellent", "good", "fair", "poor", "unknown"],
              description: "Patient adherence level. ONLY populate if explicitly stated in the document. Do NOT infer adherence from other information. Leave empty if not mentioned.",
            },
            sideEffects: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Reported side effects. ONLY extract if explicitly mentioned in the document. Do NOT list common side effects unless the document states the patient experienced them. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            notes: {
              type: "string",
              description: "Additional notes about this medication",
            },
            therapeuticClass: {
              type: "array",
              items: { type: "string" },
              description:
                "Therapeutic classes: antibiotic, analgesic, antihypertensive, etc.",
            },
            searchTerms: {
              type: "array",
              items: { type: "string" },
              description:
                "Search-optimized terms: generic names, brand names, drug classes, indications",
            },
            linkedMedicationId: {
              type: "string",
              description:
                "Care Plan link annotation. ONLY set when a CarePlanExtractionContext was provided in the request and you are confident this medication matches an existing entry in CarePlanExtractionContext.recentMedications — set to that entry's id. Leave unset otherwise.",
            },
          },
          required: ["medicationName"],
        },
      },
      // Discontinued medications
      discontinuedMedications: {
        type: "array",
        description:
          "Recently discontinued medications. CRITICAL: ONLY include medications the document EXPLICITLY states are being stopped, withdrawn, or discontinued by the provider (e.g., 'stop atorvastatin', 'discontinue metformin'). Absence of a medication from a current-medications list is NOT evidence of discontinuation — that comparison is handled client-side with user confirmation. If no medication is explicitly discontinued in this document, return an empty array.",
        items: {
          type: "object",
          properties: {
            medicationName: {
              type: "string",
              description:
                "Name of discontinued medication. ONLY include if the document explicitly states this medication is being stopped/discontinued/withdrawn by the provider.",
            },
            dateDiscontinued: {
              type: "string",
              description:
                "Date when stopped. ONLY populate if explicitly stated in the document.",
            },
            reasonDiscontinued: {
              type: "string",
              enum: [
                "adverse_effects",
                "ineffective",
                "patient_preference",
                "cost",
                "drug_interaction",
                "completed_course",
              ],
              description:
                "Reason for discontinuation. ONLY populate if explicitly stated. Do NOT guess from clinical context.",
            },
            prescriber: {
              type: "string",
              description:
                "Provider who discontinued. ONLY populate if explicitly named in the document.",
            },
            linkedMedicationId: {
              type: "string",
              description:
                "Care Plan link annotation. ONLY set when a CarePlanExtractionContext was provided in the request and you are confident this medication matches an existing entry in CarePlanExtractionContext.recentMedications — set to that entry's id. Leave unset otherwise.",
            },
          },
        },
      },
      // Medication changes (for reconciliation documents)
      medicationChanges: {
        type: "array",
        description:
          "Changes to existing medications. CRITICAL: ONLY include changes the document EXPLICITLY describes (e.g., 'increase dose to 20mg', 'switch to lisinopril', 'reduce frequency to once daily'). NEVER infer a change by comparing values across documents or by reasoning about what the doctor might mean. If no change is explicitly described in this document, return an empty array.",
        items: {
          type: "object",
          properties: {
            medicationName: {
              type: "string",
              description:
                "Medication being changed. ONLY include if a change is explicitly described in the document.",
            },
            changeType: {
              type: "string",
              enum: [
                "dose_increase",
                "dose_decrease",
                "frequency_change",
                "discontinued",
                "switched",
                "added",
              ],
              description:
                "Type of change. ONLY populate when the document explicitly describes the change (e.g., 'increase to 20mg', 'switch to lisinopril', 'stop atorvastatin'). Do NOT infer from comparing values across documents.",
            },
            previousDose: {
              type: "string",
              description:
                "Previous dosage. ONLY extract the literal value written in this document. Do NOT reconstruct from prior context or memory.",
            },
            newDose: {
              type: "string",
              description:
                "New dosage. ONLY extract the literal value written in this document. Do NOT reconstruct from prior context.",
            },
            reason: {
              type: "string",
              enum: [
                "dose_adjustment",
                "side_effects",
                "ineffective",
                "drug_interaction",
                "cost",
                "availability",
              ],
              description:
                "Reason for change. ONLY populate if the document explicitly states the reason. Do NOT guess from clinical context.",
            },
            effectiveDate: {
              type: "string",
              description:
                "When change takes effect. ONLY populate if explicitly stated in the document.",
            },
            linkedMedicationId: {
              type: "string",
              description:
                "Care Plan link annotation. ONLY set when a CarePlanExtractionContext was provided in the request and you are confident this change refers to an existing entry in CarePlanExtractionContext.recentMedications — set to that entry's id. Leave unset otherwise.",
            },
          },
        },
      },
      // Medication allergies reference
      medicationAllergies: {
        type: "array",
        description: "Medication allergies mentioned in context",
        items: {
          type: "object",
          properties: {
            medication: {
              type: "string",
              description: "Medication causing allergy",
            },
            reaction: {
              type: "string",
              description: "Type of reaction",
            },
            severity: {
              type: "string",
              enum: ["mild", "moderate", "severe", "life_threatening"],
              description: "Severity level",
            },
          },
        },
      },
      // Document context
      context: {
        type: "object",
        properties: {
          isPrescription: {
            type: "boolean",
            description: "Is this a prescription document?",
          },
          isMedicationList: {
            type: "boolean",
            description: "Is this a medication list/reconciliation?",
          },
          source: {
            type: "string",
            enum: [
              "prescription_pad",
              "electronic_prescription",
              "medication_list",
              "discharge_summary",
              "clinic_notes",
              "hospital_records",
              "pharmacy_records",
              "patient_reported",
            ],
            description: "Source of medication information",
          },
          reliability: {
            type: "string",
            enum: [
              "verified",
              "patient_reported",
              "family_reported",
              "unverified",
            ],
            description: "Reliability of information",
          },
          lastUpdated: {
            type: "string",
            description: "When medication information was last updated",
          },
          reconciliationPerformed: {
            type: "boolean",
            description: "Was medication reconciliation performed?",
          },
        },
      },
      // Additional providers (primary performer extracted by medical-analysis node)
      // Expected roles: pharmacist, pharmacy_technician, care_coordinator
      documentingProvider: corePerformer,
      pharmacyInformation: {
        type: "object",
        properties: {
          pharmacyName: {
            type: "string",
            description: "Pharmacy name",
          },
          pharmacyAddress: {
            type: "string",
            description: "Pharmacy address",
          },
          pharmacyPhone: {
            type: "string",
            description: "Pharmacy phone",
          },
          pharmacist: {
            type: "string",
            description: "Pharmacist name",
          },
        },
      },
      // Clinical decision support
      interactions: {
        type: "array",
        description: "Drug interactions mentioned",
        items: {
          type: "object",
          properties: {
            drug1: {
              type: "string",
              description: "First medication",
            },
            drug2: {
              type: "string",
              description: "Second medication/substance",
            },
            severity: {
              type: "string",
              enum: ["minor", "moderate", "major", "contraindicated"],
              description: "Interaction severity",
            },
            effect: {
              type: "string",
              description:
                "Description of interaction. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
          },
        },
      },
      adherenceAssessment: {
        type: "object",
        properties: {
          overallAdherence: {
            type: "string",
            enum: ["excellent", "good", "fair", "poor"],
            description: "Overall medication adherence",
          },
          barriers: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "cost",
                "side_effects",
                "complexity",
                "forgetfulness",
                "lifestyle",
                "access",
              ],
            },
            description: "Barriers to adherence",
          },
          interventions: {
            type: "array",
            items: {
              type: "string",
            },
            description:
              "Interventions recommended. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
        },
      },
    },
    required: ["documentType", "hasMedications"],
  },
} as FunctionDefinition;
