import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreSignals from "./core.signals";
import corePerformer from "./core.performer";

/**
 * Echocardiogram (Echo) Schema
 *
 * Extracts echocardiographic measurements, cardiac function assessment, and ultrasound findings.
 * Directly embeds core schemas for proper data structure consistency.
 */
export default {
  name: "extract_echo_information",
  description:
    "Extract all echocardiographic findings, cardiac measurements, ventricular function, valve assessments, and ultrasound interpretations from medical documents.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasEcho: {
        type: "boolean",
        description: "Does this document contain echocardiogram information?",
      },
      echoDateTime: {
        type: "string",
        description: "Date and time of echocardiogram study (ISO format)",
      },
      studyType: {
        type: "string",
        enum: [
          "transthoracic",
          "transesophageal",
          "stress_echo",
          "contrast_echo",
          "3d_echo",
          "dobutamine_stress",
          "exercise_stress",
          "other",
        ],
        description: "Type of echocardiographic study",
      },
      leftVentricle: {
        type: "object",
        properties: {
          dimensions: {
            type: "object",
            properties: {
              lvedd: {
                type: "number",
                description: "Left ventricular end-diastolic diameter (mm). ONLY populate if explicitly stated in the document.",
              },
              lvesd: {
                type: "number",
                description: "Left ventricular end-systolic diameter (mm). ONLY populate if explicitly stated in the document.",
              },
              lvpwt: {
                type: "number",
                description: "Left ventricular posterior wall thickness (mm). ONLY populate if explicitly stated in the document.",
              },
              ivst: {
                type: "number",
                description: "Interventricular septal thickness (mm). ONLY populate if explicitly stated in the document.",
              },
              lvedv: {
                type: "number",
                description: "Left ventricular end-diastolic volume (mL). ONLY populate if explicitly stated in the document.",
              },
              lvesv: {
                type: "number",
                description: "Left ventricular end-systolic volume (mL). ONLY populate if explicitly stated in the document.",
              },
            },
          },
          systolicFunction: {
            type: "object",
            properties: {
              ejectionFraction: {
                type: "number",
                description: "Left ventricular ejection fraction (%). ONLY populate if explicitly stated in the document.",
              },
              efMethod: {
                type: "string",
                enum: ["biplane", "simpson", "visual", "teicholz", "other"],
                description: "Method used to calculate ejection fraction",
              },
              wallMotion: {
                type: "string",
                enum: [
                  "normal",
                  "hypokinetic",
                  "akinetic",
                  "dyskinetic",
                  "aneurysmal",
                ],
                description: "Overall wall motion assessment",
              },
              wallMotionAbnormalities: {
                type: "array",
                description: "Specific wall motion abnormalities",
                items: {
                  type: "object",
                  properties: {
                    segment: {
                      type: "string",
                      description: "Affected cardiac segment",
                    },
                    abnormality: {
                      type: "string",
                      enum: ["hypokinetic", "akinetic", "dyskinetic"],
                      description: "Type of wall motion abnormality",
                    },
                  },
                },
              },
            },
          },
          diastolicFunction: {
            type: "object",
            properties: {
              grade: {
                type: "string",
                enum: [
                  "normal",
                  "grade_1",
                  "grade_2",
                  "grade_3",
                  "indeterminate",
                ],
                description: "Diastolic dysfunction grade",
              },
              eVelocity: {
                type: "number",
                description: "Mitral E velocity (m/s). ONLY populate if explicitly stated in the document.",
              },
              aVelocity: {
                type: "number",
                description: "Mitral A velocity (m/s). ONLY populate if explicitly stated in the document.",
              },
              eaRatio: {
                type: "number",
                description: "E/A ratio. ONLY populate if explicitly stated in the document.",
              },
              ePrimeVelocity: {
                type: "number",
                description: "Tissue Doppler e' velocity (cm/s). ONLY populate if explicitly stated in the document.",
              },
              eeRatio: {
                type: "number",
                description: "E/e' ratio. ONLY populate if explicitly stated in the document.",
              },
              decelerationTime: {
                type: "number",
                description: "Deceleration time (ms). ONLY populate if explicitly stated in the document.",
              },
            },
          },
        },
      },
      rightVentricle: {
        type: "object",
        properties: {
          size: {
            type: "string",
            enum: [
              "normal",
              "mildly_dilated",
              "moderately_dilated",
              "severely_dilated",
            ],
            description: "Right ventricular size",
          },
          function: {
            type: "string",
            enum: [
              "normal",
              "mildly_reduced",
              "moderately_reduced",
              "severely_reduced",
            ],
            description: "Right ventricular systolic function",
          },
          tapse: {
            type: "number",
            description: "Tricuspid annular plane systolic excursion (mm). ONLY populate if explicitly stated in the document.",
          },
          rvsp: {
            type: "number",
            description: "Right ventricular systolic pressure (mmHg). ONLY populate if explicitly stated in the document.",
          },
        },
      },
      leftAtrium: {
        type: "object",
        properties: {
          size: {
            type: "string",
            enum: [
              "normal",
              "mildly_dilated",
              "moderately_dilated",
              "severely_dilated",
            ],
            description: "Left atrial size",
          },
          volume: {
            type: "number",
            description: "Left atrial volume (mL). ONLY populate if explicitly stated in the document.",
          },
          volumeIndex: {
            type: "number",
            description: "Left atrial volume index (mL/m²). ONLY populate if explicitly stated in the document.",
          },
        },
      },
      rightAtrium: {
        type: "object",
        properties: {
          size: {
            type: "string",
            enum: [
              "normal",
              "mildly_dilated",
              "moderately_dilated",
              "severely_dilated",
            ],
            description: "Right atrial size",
          },
        },
      },
      valves: {
        type: "object",
        properties: {
          mitral: {
            type: "object",
            properties: {
              regurgitation: {
                type: "string",
                enum: ["none", "trace", "mild", "moderate", "severe"],
                description: "Mitral regurgitation severity",
              },
              stenosis: {
                type: "string",
                enum: ["none", "mild", "moderate", "severe"],
                description: "Mitral stenosis severity",
              },
              meanGradient: {
                type: "number",
                description: "Mean mitral gradient (mmHg). ONLY populate if explicitly stated in the document.",
              },
              valveArea: {
                type: "number",
                description: "Mitral valve area (cm²). ONLY populate if explicitly stated in the document.",
              },
              morphology: {
                type: "string",
                description: "Mitral valve morphology description",
              },
            },
          },
          aortic: {
            type: "object",
            properties: {
              regurgitation: {
                type: "string",
                enum: ["none", "trace", "mild", "moderate", "severe"],
                description: "Aortic regurgitation severity",
              },
              stenosis: {
                type: "string",
                enum: ["none", "mild", "moderate", "severe"],
                description: "Aortic stenosis severity",
              },
              peakVelocity: {
                type: "number",
                description: "Peak aortic velocity (m/s). ONLY populate if explicitly stated in the document.",
              },
              meanGradient: {
                type: "number",
                description: "Mean aortic gradient (mmHg). ONLY populate if explicitly stated in the document.",
              },
              valveArea: {
                type: "number",
                description: "Aortic valve area (cm²). ONLY populate if explicitly stated in the document.",
              },
              morphology: {
                type: "string",
                description: "Aortic valve morphology description",
              },
            },
          },
          tricuspid: {
            type: "object",
            properties: {
              regurgitation: {
                type: "string",
                enum: ["none", "trace", "mild", "moderate", "severe"],
                description: "Tricuspid regurgitation severity",
              },
              peakVelocity: {
                type: "number",
                description: "Peak tricuspid regurgitation velocity (m/s). ONLY populate if explicitly stated in the document.",
              },
            },
          },
          pulmonary: {
            type: "object",
            properties: {
              regurgitation: {
                type: "string",
                enum: ["none", "trace", "mild", "moderate", "severe"],
                description: "Pulmonary regurgitation severity",
              },
            },
          },
        },
      },
      pericardium: {
        type: "object",
        properties: {
          effusion: {
            type: "string",
            enum: ["none", "trivial", "small", "moderate", "large"],
            description: "Pericardial effusion size",
          },
          tamponade: {
            type: "boolean",
            description: "Evidence of cardiac tamponade",
          },
          thickness: {
            type: "string",
            description: "Pericardial thickness assessment",
          },
        },
      },
      aorta: {
        type: "object",
        properties: {
          root: {
            type: "number",
            description: "Aortic root dimension (mm). ONLY populate if explicitly stated in the document.",
          },
          ascendingAorta: {
            type: "number",
            description: "Ascending aorta dimension (mm). ONLY populate if explicitly stated in the document.",
          },
          abnormalities: {
            type: "array",
            description: "Aortic abnormalities",
            items: {
              type: "string",
            },
          },
        },
      },
      otherFindings: {
        type: "array",
        description: "Additional echocardiographic findings",
        items: {
          type: "object",
          properties: {
            finding: {
              type: "string",
              description: "Description of finding",
            },
            location: {
              type: "string",
              description: "Anatomical location",
            },
            significance: {
              type: "string",
              enum: [
                "normal_variant",
                "mild",
                "moderate",
                "severe",
                "clinical_correlation",
              ],
              description: "Clinical significance",
            },
          },
        },
      },
      // Embed core.signals for associated vital signs (measurements only)
      associatedVitalSigns: coreSignals,

      // Additional performers (primary performer extracted by medical-analysis node)
      // Expected roles: cardiologist, cardiologist_interventional, cardiologist_electrophysiology
      interpretingCardiologist: corePerformer,

      // Expected roles: echo_technician, ultrasound_technician
      echoTechnician: corePerformer,

      clinicalContext: {
        type: "string",
        description: "Clinical context for this echocardiogram study",
      },
      technicalQuality: {
        type: "object",
        properties: {
          imageQuality: {
            type: "string",
            enum: ["excellent", "good", "fair", "poor", "suboptimal"],
            description: "Overall image quality",
          },
          limitations: {
            type: "array",
            description: "Technical limitations affecting study",
            items: {
              type: "string",
              enum: [
                "poor_acoustic_windows",
                "patient_cooperation",
                "body_habitus",
                "lung_disease",
                "mechanical_ventilation",
                "other",
              ],
            },
          },
          completeness: {
            type: "string",
            enum: ["complete", "limited", "incomplete"],
            description: "Study completeness",
          },
        },
      },
      comparison: {
        type: "object",
        properties: {
          priorStudyDate: {
            type: "string",
            description: "Date of prior echocardiogram",
          },
          changes: {
            type: "string",
            description: "Changes compared to prior study",
          },
          interval: {
            type: "string",
            description: "Time interval since prior study",
          },
        },
      },
      clinicalIndication: {
        type: "string",
        description: "Clinical indication for echocardiogram",
      },
      summary: {
        type: "string",
        description:
          "Overall echocardiographic summary. Translate to [LANGUAGE] if needed.",
      },
      recommendedFollowUp: {
        type: "array",
        description: "Recommended follow-up actions",
        items: {
          type: "string",
        },
      },
    },
    required: ["hasEcho"],
  },
} as FunctionDefinition;
