import type { FunctionDefinition } from "@langchain/core/language_models/base";
import coreRecommendations from "./core.recommendations";
import coreDiagnosis from "./core.diagnosis";
import corePerformer from "./core.performer";
import coreBodyParts from "./core.bodyParts";
import coreSignals from "./core.signals";

/**
 * Assessment Schema
 *
 * Extracts clinical assessment and specialist evaluation.
 * Reuses core components for consistency.
 */
export default {
  name: "extract_assessment",
  description:
    "Extract comprehensive clinical assessment and specialist evaluation including clinical impressions, differential diagnoses, and professional assessments.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasAssessment: {
        type: "boolean",
        description:
          "Does this document contain clinical assessment or specialist evaluation?",
      },

      clinicalImpression: {
        type: "object",
        description: "Primary clinical impression",
        properties: {
          primaryImpression: {
            type: "string",
            description:
              "Primary clinical impression or working diagnosis. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
          // Reuse core.diagnosis for structured diagnosis
          primaryDiagnosis: coreDiagnosis,

          confidence: {
            type: "string",
            enum: ["high", "moderate", "low", "uncertain"],
            description: "Clinician confidence in primary impression",
          },

          supportingEvidence: {
            type: "array",
            description: "Evidence supporting the primary impression",
            items: {
              type: "string",
            },
          },

          contradictingEvidence: {
            type: "array",
            description:
              "Evidence that contradicts or complicates the impression",
            items: {
              type: "string",
            },
          },
        },
      },

      differentialDiagnoses: {
        type: "array",
        description: "Differential diagnosis considerations",
        items: {
          type: "object",
          properties: {
            // Reuse core.diagnosis for each differential
            diagnosis: coreDiagnosis,
            likelihood: {
              type: "string",
              enum: ["high", "moderate", "low", "rule_out"],
              description: "Likelihood of this diagnosis",
            },
            supportingFactors: {
              type: "array",
              description: "Factors supporting this diagnosis",
              items: {
                type: "string",
              },
            },
            opposingFactors: {
              type: "array",
              description: "Factors opposing this diagnosis",
              items: {
                type: "string",
              },
            },
            additionalTestsNeeded: {
              type: "array",
              description: "Additional tests needed to confirm/rule out",
              items: {
                type: "string",
              },
            },
          },
          required: ["diagnosis", "likelihood"],
        },
      },

      systemsAssessment: {
        type: "array",
        description: "Assessment by body system",
        items: {
          type: "object",
          properties: {
            // Reuse core.bodyParts for system
            system: coreBodyParts,
            assessment: {
              type: "string",
              description:
                "Assessment of this system. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            abnormalities: {
              type: "array",
              description: "Identified abnormalities",
              items: {
                type: "string",
              },
            },
            significance: {
              type: "string",
              enum: ["critical", "significant", "minor", "incidental"],
              description: "Clinical significance",
            },
          },
        },
      },

      riskAssessment: {
        type: "object",
        description: "Clinical risk assessment",
        properties: {
          overallRisk: {
            type: "string",
            enum: ["low", "intermediate", "high", "critical"],
            description: "Overall clinical risk level",
          },
          specificRisks: {
            type: "array",
            description: "Specific identified risks",
            items: {
              type: "object",
              properties: {
                risk: {
                  type: "string",
                  description:
                    "Risk description. Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
                probability: {
                  type: "string",
                  enum: ["low", "moderate", "high"],
                  description: "Probability of risk occurring",
                },
                impact: {
                  type: "string",
                  enum: ["minor", "moderate", "major", "catastrophic"],
                  description: "Potential impact if risk occurs",
                },
                timeframe: {
                  type: "string",
                  description:
                    "Timeframe for potential risk. Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
                mitigationStrategies: {
                  type: "array",
                  description: "Strategies to mitigate this risk",
                  items: {
                    type: "string",
                  },
                },
              },
            },
          },
          comorbidityImpact: {
            type: "string",
            description:
              "Impact of existing comorbidities on assessment. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
        },
      },

      prognosticAssessment: {
        type: "object",
        description: "Prognosis and outlook",
        properties: {
          shortTermPrognosis: {
            type: "string",
            enum: ["excellent", "good", "fair", "poor", "critical"],
            description: "Short-term prognosis (days to weeks)",
          },
          longTermPrognosis: {
            type: "string",
            enum: ["excellent", "good", "fair", "poor", "uncertain"],
            description: "Long-term prognosis (months to years)",
          },
          prognosticFactors: {
            type: "array",
            description: "Factors affecting prognosis",
            items: {
              type: "object",
              properties: {
                factor: {
                  type: "string",
                  description:
                    "Prognostic factor. Translate result to the [LANGUAGE] language if the source is in a different language.",
                },
                impact: {
                  type: "string",
                  enum: ["favorable", "unfavorable", "neutral"],
                  description: "Impact on prognosis",
                },
              },
            },
          },
          expectedCourse: {
            type: "string",
            description:
              "Expected clinical course. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
          potentialComplications: {
            type: "array",
            description: "Potential complications to monitor",
            items: {
              type: "string",
            },
          },
        },
      },

      functionalAssessment: {
        type: "object",
        description: "Functional status assessment",
        properties: {
          activitiesOfDailyLiving: {
            type: "object",
            properties: {
              independence: {
                type: "string",
                enum: ["independent", "partially_dependent", "dependent"],
                description: "Level of independence in ADLs",
              },
              specificLimitations: {
                type: "array",
                description: "Specific ADL limitations",
                items: {
                  type: "string",
                },
              },
            },
          },
          mobility: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["full_mobility", "limited_mobility", "immobile"],
                description: "Mobility status",
              },
              assistiveDevices: {
                type: "array",
                description: "Required assistive devices",
                items: {
                  type: "string",
                },
              },
              fallRisk: {
                type: "string",
                enum: ["low", "moderate", "high"],
                description: "Fall risk assessment",
              },
            },
          },
          cognitiveFunction: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: [
                  "normal",
                  "mild_impairment",
                  "moderate_impairment",
                  "severe_impairment",
                ],
                description: "Cognitive function status",
              },
              specificDeficits: {
                type: "array",
                description: "Specific cognitive deficits",
                items: {
                  type: "string",
                },
              },
            },
          },
        },
      },

      specialistConsultation: {
        type: "object",
        description: "Specialist consultation details",
        properties: {
          consultingSpecialty: {
            type: "string",
            description: "Medical specialty providing consultation",
          },
          // Expected roles: oncologist, cardiologist, neurologist, psychiatrist, other_specialist
          consultant: corePerformer,

          consultationReason: {
            type: "string",
            description:
              "Reason for specialist consultation. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },

          questionToConsultant: {
            type: "array",
            description: "Specific questions posed to consultant",
            items: {
              type: "string",
            },
          },

          consultantOpinion: {
            type: "string",
            description:
              "Consultant's professional opinion. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },

          agreementWithReferring: {
            type: "string",
            enum: [
              "full_agreement",
              "partial_agreement",
              "disagreement",
              "alternative_opinion",
            ],
            description: "Level of agreement with referring provider",
          },
        },
      },

      // Reuse core.signals for assessment-related measurements
      assessmentMeasures: coreSignals,

      // Reuse core.recommendations for assessment-based recommendations
      recommendations: coreRecommendations,

      // Additional performers (primary performer extracted by medical-analysis node)
      // Expected roles: attending_physician, resident_physician, fellow, consultant, other_specialist
      assessingPhysician: corePerformer,

      assessmentDate: {
        type: "string",
        description: "Date of assessment (ISO format)",
      },

      levelOfCare: {
        type: "string",
        enum: [
          "outpatient",
          "observation",
          "inpatient",
          "ICU",
          "step_down",
          "long_term_care",
        ],
        description: "Recommended level of care",
      },

      disposition: {
        type: "string",
        enum: [
          "discharge_home",
          "transfer",
          "admission",
          "observation",
          "follow_up",
          "urgent_referral",
        ],
        description: "Patient disposition based on assessment",
      },

      urgency: {
        type: "string",
        enum: ["routine", "urgent", "stat", "emergent"],
        description: "Clinical urgency of situation",
      },

      qualityOfAssessment: {
        type: "object",
        properties: {
          dataQuality: {
            type: "string",
            enum: ["excellent", "good", "limited", "poor"],
            description: "Quality of available data for assessment",
          },
          limitations: {
            type: "array",
            description: "Limitations affecting assessment quality",
            items: {
              type: "string",
            },
          },
          additionalDataNeeded: {
            type: "array",
            description: "Additional data needed for complete assessment",
            items: {
              type: "string",
            },
          },
        },
      },

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in assessment extraction (0-1)",
      },
    },
    required: ["hasAssessment"],
  },
} as FunctionDefinition;
