import type { FunctionDefinition } from "@langchain/core/language_models/base";

/**
 * Social History Schema
 *
 * Extracts social history and lifestyle factors.
 * Focuses on medically relevant social determinants of health.
 */
export default {
  name: "extract_social_history",
  description:
    "Extract comprehensive social history and lifestyle factors that impact health including substance use, occupational exposures, social determinants, and behavioral risk factors.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasSocialHistory: {
        type: "boolean",
        description:
          "Does this document contain social history or lifestyle information?",
      },

      smokingHistory: {
        type: "object",
        description: "Smoking and tobacco use history",
        properties: {
          status: {
            type: "string",
            enum: ["never", "former", "current", "unknown"],
            description: "Smoking status",
          },
          packYears: {
            type: "string",
            description: "Pack-years of smoking if specified",
          },
          startAge: {
            type: "string",
            description: "Age started smoking",
          },
          quitDate: {
            type: "string",
            description: "Date quit smoking (ISO format)",
          },
          tobaccoType: {
            type: "array",
            description: "Types of tobacco used",
            items: {
              type: "string",
              enum: [
                "cigarettes",
                "cigars",
                "pipe",
                "chewing_tobacco",
                "snuff",
                "e_cigarettes",
                "other",
              ],
            },
          },
          currentAmount: {
            type: "string",
            description: "Current smoking amount (cigarettes per day, etc.)",
          },
          cessationAttempts: {
            type: "boolean",
            description: "History of cessation attempts",
          },
        },
      },

      alcoholUse: {
        type: "object",
        description: "Alcohol consumption history",
        properties: {
          status: {
            type: "string",
            enum: ["never", "former", "current", "occasional", "unknown"],
            description: "Alcohol use status",
          },
          frequency: {
            type: "string",
            description: "Frequency of alcohol use",
          },
          amount: {
            type: "string",
            description: "Amount consumed (drinks per day/week)",
          },
          type: {
            type: "array",
            description: "Types of alcohol consumed",
            items: {
              type: "string",
              enum: ["beer", "wine", "spirits", "mixed_drinks"],
            },
          },
          bingeDrinking: {
            type: "boolean",
            description: "History of binge drinking",
          },
          problems: {
            type: "array",
            description: "Alcohol-related problems",
            items: {
              type: "string",
            },
          },
          treatmentHistory: {
            type: "boolean",
            description: "History of alcohol treatment",
          },
        },
      },

      substanceUse: {
        type: "array",
        description: "Other substance use history",
        items: {
          type: "object",
          properties: {
            substance: {
              type: "string",
              description:
                "Substance name or type. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            status: {
              type: "string",
              enum: ["never", "former", "current", "unknown"],
              description: "Use status",
            },
            frequency: {
              type: "string",
              description: "Frequency of use",
            },
            route: {
              type: "string",
              enum: ["oral", "inhalation", "injection", "nasal", "other"],
              description: "Route of administration",
            },
            startAge: {
              type: "string",
              description:
                "Age started using. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            lastUse: {
              type: "string",
              description: "Date of last use",
            },
            treatmentHistory: {
              type: "boolean",
              description: "History of treatment for substance use",
            },
          },
          required: ["substance", "status"],
        },
      },

      occupationalHistory: {
        type: "array",
        description: "Occupational history and exposures",
        items: {
          type: "object",
          properties: {
            jobTitle: {
              type: "string",
              description:
                "Job title or occupation. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            employer: {
              type: "string",
              description:
                "Employer name. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            industry: {
              type: "string",
              description:
                "Industry type. Use standardized terminology from the [LANGUAGE] localization set.",
            },
            duration: {
              type: "string",
              description: "Duration of employment",
            },
            exposures: {
              type: "array",
              description: "Occupational exposures",
              items: {
                type: "object",
                properties: {
                  agent: {
                    type: "string",
                    description:
                      "Exposure agent (asbestos, chemicals, radiation, etc.). Translate result to the [LANGUAGE] language if the source is in a different language.",
                  },
                  duration: {
                    type: "string",
                    description: "Duration of exposure",
                  },
                  protection: {
                    type: "string",
                    description: "Protective equipment used",
                  },
                  intensity: {
                    type: "string",
                    enum: ["low", "moderate", "high", "unknown"],
                    description: "Exposure intensity",
                  },
                },
              },
            },
            currentJob: {
              type: "boolean",
              description: "Is this the current job?",
            },
          },
        },
      },

      environmentalExposures: {
        type: "array",
        description: "Environmental and residential exposures",
        items: {
          type: "object",
          properties: {
            exposure: {
              type: "string",
              description:
                "Type of environmental exposure. Use standardized terminology from the [LANGUAGE] localization set.",
            },
            source: {
              type: "string",
              description:
                "Source of exposure. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            duration: {
              type: "string",
              description:
                "Duration of exposure. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
            location: {
              type: "string",
              description:
                "Geographic location of exposure. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
          },
        },
      },

      livingConditions: {
        type: "object",
        description: "Living conditions and housing",
        properties: {
          housingType: {
            type: "string",
            description:
              "Type of housing. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
          householdComposition: {
            type: "string",
            description:
              "Household composition. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
          dependents: {
            type: "string",
            description: "Number and type of dependents",
          },
          pets: {
            type: "boolean",
            description: "Presence of pets",
          },
          smokingInHome: {
            type: "boolean",
            description: "Smoking in the home",
          },
          safetyIssues: {
            type: "array",
            description: "Home safety issues",
            items: {
              type: "string",
            },
          },
        },
      },

      socioeconomicFactors: {
        type: "object",
        description: "Socioeconomic determinants of health",
        properties: {
          education: {
            type: "string",
            description: "Highest level of education completed",
          },
          employmentStatus: {
            type: "string",
            enum: [
              "employed",
              "unemployed",
              "retired",
              "disabled",
              "student",
              "homemaker",
            ],
            description: "Current employment status",
          },
          income: {
            type: "string",
            description: "Income level or range",
          },
          insurance: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["insured", "uninsured", "underinsured"],
                description: "Insurance status",
              },
              type: {
                type: "array",
                description: "Types of insurance",
                items: {
                  type: "string",
                  enum: [
                    "private",
                    "medicare",
                    "medicaid",
                    "military",
                    "other",
                  ],
                },
              },
            },
          },
          transportation: {
            type: "object",
            properties: {
              reliable: {
                type: "boolean",
                description: "Has reliable transportation",
              },
              barriers: {
                type: "array",
                description: "Transportation barriers",
                items: {
                  type: "string",
                },
              },
            },
          },
        },
      },

      socialSupport: {
        type: "object",
        description: "Social support systems",
        properties: {
          maritalStatus: {
            type: "string",
            enum: [
              "single",
              "married",
              "divorced",
              "widowed",
              "separated",
              "domestic_partner",
            ],
            description: "Marital status",
          },
          supportSystem: {
            type: "string",
            description:
              "Description of social support system. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
          caregivers: {
            type: "array",
            description: "Available caregivers",
            items: {
              type: "object",
              properties: {
                relationship: {
                  type: "string",
                  description: "Relationship to patient",
                },
                availability: {
                  type: "string",
                  description: "Availability for caregiving",
                },
              },
            },
          },
          isolation: {
            type: "boolean",
            description: "Social isolation concerns",
          },
        },
      },

      lifestyleFactors: {
        type: "object",
        description: "Lifestyle and behavioral factors",
        properties: {
          diet: {
            type: "string",
            description:
              "Dietary patterns and restrictions. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
          physicalActivity: {
            type: "object",
            properties: {
              level: {
                type: "string",
                enum: ["sedentary", "light", "moderate", "vigorous"],
                description: "Physical activity level",
              },
              types: {
                type: "array",
                description: "Types of exercise",
                items: {
                  type: "string",
                },
              },
              frequency: {
                type: "string",
                description: "Exercise frequency",
              },
            },
          },
          sleep: {
            type: "object",
            properties: {
              duration: {
                type: "string",
                description: "Average sleep duration",
              },
              quality: {
                type: "string",
                enum: ["poor", "fair", "good", "excellent"],
                description: "Sleep quality",
              },
              issues: {
                type: "array",
                description: "Sleep issues",
                items: {
                  type: "string",
                },
              },
            },
          },
          stress: {
            type: "object",
            properties: {
              level: {
                type: "string",
                enum: ["low", "moderate", "high"],
                description: "Stress level",
              },
              sources: {
                type: "array",
                description:
                  "Sources of stress. Use standardized terminology from the [LANGUAGE] localization set.",
                items: {
                  type: "string",
                },
              },
              management: {
                type: "array",
                description: "Stress management techniques",
                items: {
                  type: "string",
                },
              },
            },
          },
        },
      },

      culturalFactors: {
        type: "object",
        description: "Cultural and religious factors",
        properties: {
          ethnicity: {
            type: "string",
            description:
              "Ethnic background. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
          primaryLanguage: {
            type: "string",
            description: "Primary language spoken",
          },
          interpreterNeeded: {
            type: "boolean",
            description: "Need for interpreter services",
          },
          religiousAffiliation: {
            type: "string",
            description:
              "Religious affiliation if relevant to care. Translate result to the [LANGUAGE] language if the source is in a different language.",
          },
          culturalPractices: {
            type: "array",
            description:
              "Cultural practices affecting health care. Translate result to the [LANGUAGE] language if the source is in a different language.",
            items: {
              type: "string",
            },
          },
        },
      },

      riskFactors: {
        type: "array",
        description: "Identified social risk factors",
        items: {
          type: "object",
          properties: {
            factor: {
              type: "string",
              description:
                "Risk factor. Use standardized terminology from the [LANGUAGE] localization set.",
            },
            impact: {
              type: "string",
              enum: ["low", "moderate", "high"],
              description: "Impact on health",
            },
            intervention: {
              type: "string",
              description:
                "Recommended intervention. Translate result to the [LANGUAGE] language if the source is in a different language.",
            },
          },
        },
      },

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in social history extraction (0-1)",
      },
    },
    required: ["hasSocialHistory"],
  },
} as FunctionDefinition;
