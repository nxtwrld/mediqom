import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreSignals from "./core.signals";
import corePerformer from "./core.performer";
import coreDiagnosis from "./core.diagnosis";

/**
 * ECG (Electrocardiogram) Schema
 *
 * Extracts ECG findings, measurements, and interpretations.
 * Directly embeds core schemas for proper data structure consistency.
 */
export default {
  name: "extract_ecg_information",
  description:
    "Extract all ECG (electrocardiogram) findings, measurements, rhythm analysis, and interpretations from medical documents.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasECG: {
        type: "boolean",
        description: "Does this document contain ECG information?",
      },
      ecgDateTime: {
        type: "string",
        description: "Date and time of ECG recording (ISO format)",
      },
      basicMeasurements: {
        type: "object",
        properties: {
          heartRate: {
            type: "number",
            description: "Heart rate in beats per minute. ONLY populate if explicitly stated in the document.",
          },
          prInterval: {
            type: "number",
            description: "PR interval in milliseconds. ONLY populate if explicitly stated in the document.",
          },
          qrsWidth: {
            type: "number",
            description: "QRS width in milliseconds. ONLY populate if explicitly stated in the document.",
          },
          qtInterval: {
            type: "number",
            description: "QT interval in milliseconds. ONLY populate if explicitly stated in the document.",
          },
          qtCorrected: {
            type: "number",
            description: "QTc (corrected QT) in milliseconds. ONLY populate if explicitly stated in the document.",
          },
          axis: {
            type: "number",
            description: "QRS axis in degrees. ONLY populate if explicitly stated in the document.",
          },
        },
      },
      rhythm: {
        type: "object",
        properties: {
          primaryRhythm: {
            type: "string",
            enum: [
              "sinus_rhythm",
              "sinus_bradycardia",
              "sinus_tachycardia",
              "atrial_fibrillation",
              "atrial_flutter",
              "supraventricular_tachycardia",
              "ventricular_tachycardia",
              "ventricular_fibrillation",
              "heart_block",
              "paced_rhythm",
              "other",
            ],
            description: "Primary cardiac rhythm",
          },
          rhythmDescription: {
            type: "string",
            description:
              "Detailed rhythm description. Translate to [LANGUAGE] if needed.",
          },
          regularity: {
            type: "string",
            enum: [
              "regular",
              "irregular",
              "regularly_irregular",
              "irregularly_irregular",
            ],
            description: "Rhythm regularity",
          },
          arrhythmias: {
            type: "array",
            description: "Additional arrhythmias detected",
            items: {
              type: "string",
            },
          },
        },
      },
      waveformAnalysis: {
        type: "object",
        properties: {
          pWave: {
            type: "object",
            properties: {
              present: {
                type: "boolean",
                description: "Are P waves present?",
              },
              morphology: {
                type: "string",
                description: "P wave morphology description",
              },
              amplitude: {
                type: "string",
                description: "P wave amplitude",
              },
            },
          },
          qrsComplex: {
            type: "object",
            properties: {
              morphology: {
                type: "string",
                description: "QRS morphology",
              },
              voltage: {
                type: "string",
                description: "QRS voltage criteria",
              },
              pathologicalQ: {
                type: "boolean",
                description: "Presence of pathological Q waves",
              },
            },
          },
          tWave: {
            type: "object",
            properties: {
              morphology: {
                type: "string",
                description: "T wave morphology",
              },
              inversions: {
                type: "array",
                description: "Leads with T wave inversions",
                items: {
                  type: "string",
                },
              },
            },
          },
          stSegment: {
            type: "object",
            properties: {
              elevation: {
                type: "array",
                description: "Leads with ST elevation",
                items: {
                  type: "string",
                },
              },
              depression: {
                type: "array",
                description: "Leads with ST depression",
                items: {
                  type: "string",
                },
              },
              changes: {
                type: "string",
                description: "Description of ST segment changes",
              },
            },
          },
        },
      },
      abnormalFindings: {
        type: "array",
        description: "Abnormal ECG findings",
        items: {
          type: "object",
          properties: {
            finding: {
              type: "string",
              description: "Description of abnormal finding",
            },
            location: {
              type: "array",
              description: "ECG leads showing this finding",
              items: {
                type: "string",
              },
            },
            significance: {
              type: "string",
              enum: ["acute", "old", "possible", "probable", "definite"],
              description: "Clinical significance",
            },
          },
        },
      },
      // Directly embed core.signals for vital signs and measurements
      associatedVitalSigns: coreSignals,
      interpretation: {
        type: "object",
        properties: {
          overallInterpretation: {
            type: "string",
            description:
              "Overall ECG interpretation. Translate to [LANGUAGE] if needed.",
          },
          comparison: {
            type: "string",
            description: "Comparison with previous ECGs if available",
          },
          clinicalCorrelation: {
            type: "string",
            description: "Recommended clinical correlation",
          },
        },
      },
      // Directly embed core.diagnosis schema for ECG diagnoses
      ecgDiagnoses: {
        type: "array",
        description: "Diagnoses based on ECG findings",
        items: coreDiagnosis,
      },
      // Directly embed core.performer for interpreting physician
      interpretingPhysician: corePerformer,
      technicalQuality: {
        type: "object",
        properties: {
          quality: {
            type: "string",
            enum: ["excellent", "good", "fair", "poor", "uninterpretable"],
            description: "Technical quality of ECG",
          },
          artifacts: {
            type: "array",
            description: "Technical artifacts present",
            items: {
              type: "string",
              enum: [
                "muscle_artifact",
                "baseline_wander",
                "60hz_noise",
                "lead_reversal",
                "other",
              ],
            },
          },
          limitations: {
            type: "string",
            description: "Limitations affecting interpretation",
          },
        },
      },
      recommendedFollowUp: {
        type: "array",
        description: "Recommended follow-up actions",
        items: {
          type: "string",
        },
      },
    },
    required: ["hasECG"],
  },
} as FunctionDefinition;
