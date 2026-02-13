/**
 * Medical Classification Configuration
 *
 * Defines categories, temporal terms, and search configuration for the medical terms system.
 * All terms are standardized to English for consistent matching.
 */

export const classificationConfig = {
  version: "1.0.0",
  description:
    "Medical document classification configuration for unified medical terms search",

  categories: {
    LABORATORY: {
      id: "laboratory",
      name: "Laboratory Results",
      priority: 1,
      keywords: ["lab", "laboratory", "blood", "test", "analysis", "results"],
    },
    IMAGING: {
      id: "imaging",
      name: "Medical Imaging",
      priority: 2,
      keywords: [
        "x-ray",
        "mri",
        "ct",
        "ultrasound",
        "scan",
        "imaging",
        "radiology",
      ],
    },
    MEDICATIONS: {
      id: "medications",
      name: "Medications & Prescriptions",
      priority: 3,
      keywords: [
        "medication",
        "medicine",
        "prescription",
        "drug",
        "treatment",
        "therapy",
      ],
    },
    CARDIOLOGY: {
      id: "cardiology",
      name: "Cardiology",
      priority: 4,
      keywords: ["heart", "cardiac", "ecg", "ekg", "cardiovascular", "chest"],
    },
    SURGERY: {
      id: "surgery",
      name: "Surgical Procedures",
      priority: 5,
      keywords: ["surgery", "operation", "surgical", "procedure", "operative"],
    },
    CONSULTATION: {
      id: "consultation",
      name: "Medical Consultations",
      priority: 6,
      keywords: [
        "consultation",
        "visit",
        "examination",
        "clinical",
        "assessment",
      ],
    },
    EMERGENCY: {
      id: "emergency",
      name: "Emergency Care",
      priority: 7,
      keywords: ["emergency", "urgent", "er", "trauma", "critical"],
    },
    PATHOLOGY: {
      id: "pathology",
      name: "Pathology Reports",
      priority: 8,
      keywords: ["biopsy", "pathology", "tissue", "histology", "cytology"],
    },
    THERAPY: {
      id: "therapy",
      name: "Therapy & Rehabilitation",
      priority: 9,
      keywords: ["therapy", "rehabilitation", "physical", "occupational"],
    },
    ONCOLOGY: {
      id: "oncology",
      name: "Oncology",
      priority: 10,
      keywords: ["cancer", "tumor", "oncology", "chemotherapy", "radiation"],
    },
    MENTAL_HEALTH: {
      id: "mental_health",
      name: "Mental Health",
      priority: 11,
      keywords: [
        "psychology",
        "psychiatry",
        "mental",
        "behavioral",
        "cognitive",
      ],
    },
    PEDIATRICS: {
      id: "pediatrics",
      name: "Pediatric Care",
      priority: 12,
      keywords: ["pediatric", "children", "child", "infant", "adolescent"],
    },
    OBSTETRICS: {
      id: "obstetrics",
      name: "Obstetrics & Gynecology",
      priority: 13,
      keywords: [
        "pregnancy",
        "obstetric",
        "gynecology",
        "prenatal",
        "maternal",
      ],
    },
  },

  temporalTerms: {
    latest: {
      type: "latest",
      priority: 1,
      weight: 2.0,
      examples: ["latest", "newest", "most recent", "last", "current"],
    },
    recent: {
      type: "recent",
      priority: 2,
      weight: 1.5,
      timeframe: {
        days: 30,
        description: "Within the last 30 days",
      },
      examples: ["recent", "recently", "this month", "past month", "new"],
    },
    historical: {
      type: "historical",
      priority: 3,
      weight: 1.0,
      timeframe: {
        days: 90,
        description: "Within the last 90 days",
      },
      examples: ["previous", "prior", "earlier", "past", "old", "historical"],
    },
  },

  termGeneration: {
    useEnglishTerminology: true,
    useLatinTerminology: true,
    standardizeToICD10: true,
    includeLOINCCodes: true,
    extractProcedures: true,
    extractMedications: true,
    extractTemporalMarkers: true,
    combineExistingAnalysis: true,
    languageInstruction:
      "IMPORTANT: All medical terms must be generated in English only. Convert any foreign language medical terms to their English equivalents.",
    sources: {
      existingBodyParts:
        "Use existing 473 body parts from tags.ts (English names only)",
      existingDiagnoses:
        "Use existing ICD-10 codes from diagnosis analysis (English descriptions)",
      existingLaboratory:
        "Use existing LOINC codes and lab properties (English names)",
      standardizedTerms:
        "Generate standardized English medical terms and Latin scientific names",
      temporalTerms:
        "Extract temporal markers in English (latest, recent, historical)",
    },
  },

  searchConfiguration: {
    termMatching: {
      exactMatch: 1.0,
      partialMatch: 0.7,
      synonymMatch: 0.8,
      categoryMatch: 0.6,
      temporalBoost: 1.5,
    },
    categoryBoosts: {
      laboratory: 1.2,
      imaging: 1.1,
      medications: 1.1,
      emergency: 1.3,
      cardiology: 1.0,
    },
    temporalHandling: {
      latestQuery: {
        returnCount: 1,
        sortBy: "date",
        sortOrder: "desc",
      },
      recentQuery: {
        maxAge: 30,
        returnCount: 10,
        sortBy: "relevance_then_date",
      },
    },
    minimumScore: 0.3,
    maxResults: 20,
  },

  migrationSettings: {
    batchSize: 10,
    minimumConfidence: 0.6,
    retryFailedClassifications: true,
    preserveExistingTerms: true,
    backgroundProcessing: true,
  },
} as const;

// Export types for better TypeScript support
export type MedicalCategory = keyof typeof classificationConfig.categories;
export type TemporalType = keyof typeof classificationConfig.temporalTerms;

// Helper function to get all medical keywords
export function getAllMedicalKeywords(): string[] {
  const keywords = new Set<string>();

  // Add category keywords
  Object.values(classificationConfig.categories).forEach((category) => {
    category.keywords.forEach((keyword) => keywords.add(keyword));
  });

  // Add temporal examples
  Object.values(classificationConfig.temporalTerms).forEach((temporal) => {
    temporal.examples.forEach((example) => keywords.add(example));
  });

  return Array.from(keywords);
}
