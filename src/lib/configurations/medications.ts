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
    "Extract comprehensive medication information including current medications, new prescriptions, dosages, administration instructions, and medication management details. This schema handles both medication lists and prescription documents.",
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
                    "Number of days (0 = until finished, -1 = not specified)",
                },
                quantity: {
                  type: "string",
                  description: "Total quantity to dispense",
                },
                refills: {
                  type: "number",
                  description: "Number of refills authorized",
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
              description: "Current dosage with units",
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
              description: "Current status",
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
          },
          required: ["medicationName"],
        },
      },
      // Discontinued medications
      discontinuedMedications: {
        type: "array",
        description: "Recently discontinued medications",
        items: {
          type: "object",
          properties: {
            medicationName: {
              type: "string",
              description: "Name of discontinued medication",
            },
            dateDiscontinued: {
              type: "string",
              description: "Date when stopped",
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
              description: "Reason for discontinuation",
            },
            prescriber: {
              type: "string",
              description: "Provider who discontinued",
            },
          },
        },
      },
      // Medication changes (for reconciliation documents)
      medicationChanges: {
        type: "array",
        description: "Changes to existing medications",
        items: {
          type: "object",
          properties: {
            medicationName: {
              type: "string",
              description: "Medication being changed",
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
              description: "Type of change",
            },
            previousDose: {
              type: "string",
              description: "Previous dosage",
            },
            newDose: {
              type: "string",
              description: "New dosage",
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
              description: "Reason for change",
            },
            effectiveDate: {
              type: "string",
              description: "When change takes effect",
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
