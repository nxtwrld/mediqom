import type { FunctionDefinition } from "@langchain/core/language_models/base";
import corePerformer from "./core.performer";
import coreDiagnosis from "./core.diagnosis";

/**
 * Molecular Schema
 *
 * Extracts molecular, genetic, and biomarker analysis.
 * Reuses core components for consistency.
 */
export default {
  name: "extract_molecular",
  description:
    "Extract comprehensive molecular, genetic, and biomarker analysis including genomic testing, tumor molecular profiling, and hereditary genetic testing.\n\nCRITICAL: ONLY extract information explicitly stated in the document. Do NOT infer, guess, or fabricate values. If a field is not mentioned, omit it entirely.",
  parameters: {
    type: "object",
    properties: {
      hasMolecular: {
        type: "boolean",
        description:
          "Does this document contain molecular, genetic, or biomarker analysis?",
      },

      testingType: {
        type: "string",
        enum: [
          "tumor_profiling",
          "hereditary_testing",
          "pharmacogenomics",
          "liquid_biopsy",
          "companion_diagnostics",
          "research",
        ],
        description: "Type of molecular testing performed",
      },

      genomicTesting: {
        type: "object",
        description: "Genomic sequencing and mutation analysis",
        properties: {
          platform: {
            type: "string",
            description:
              "Sequencing platform used (Foundation One, Guardant360, etc.)",
          },
          methodology: {
            type: "string",
            enum: [
              "whole_genome",
              "whole_exome",
              "targeted_panel",
              "single_gene",
              "RNA_seq",
            ],
            description: "Sequencing methodology",
          },
          coverage: {
            type: "string",
            description: "Genomic coverage or number of genes analyzed. ONLY populate if explicitly stated in the document.",
          },
          qualityMetrics: {
            type: "object",
            properties: {
              meanCoverage: {
                type: "string",
                description: "Mean sequencing coverage",
              },
              uniformity: {
                type: "string",
                description: "Coverage uniformity percentage",
              },
              tumorPurity: {
                type: "string",
                description: "Estimated tumor purity percentage",
              },
            },
          },
        },
      },

      geneticVariants: {
        type: "array",
        description: "Identified genetic variants",
        items: {
          type: "object",
          properties: {
            gene: {
              type: "string",
              description: "Gene name (HGNC symbol)",
            },
            variant: {
              type: "string",
              description: "Variant description (HGVS nomenclature)",
            },
            variantType: {
              type: "string",
              enum: ["SNV", "indel", "CNV", "SV", "fusion", "splice_variant"],
              description: "Type of genetic variant",
            },
            classification: {
              type: "string",
              enum: [
                "pathogenic",
                "likely_pathogenic",
                "VUS",
                "likely_benign",
                "benign",
              ],
              description: "Variant classification",
            },
            alleleFrequency: {
              type: "string",
              description: "Variant allele frequency. ONLY populate if explicitly stated in the document.",
            },
            tumorMutationalBurden: {
              type: "string",
              description: "Tumor mutational burden if applicable. ONLY populate if explicitly stated in the document.",
            },
            clinicalSignificance: {
              type: "string",
              description: "Clinical significance of variant",
            },
            therapeuticImplications: {
              type: "array",
              description: "Therapeutic implications",
              items: {
                type: "object",
                properties: {
                  drug: {
                    type: "string",
                    description: "Associated drug or therapy",
                  },
                  relationship: {
                    type: "string",
                    enum: [
                      "sensitive",
                      "resistant",
                      "response",
                      "toxicity",
                      "dosing",
                    ],
                    description: "Relationship to therapy",
                  },
                  evidenceLevel: {
                    type: "string",
                    enum: [
                      "FDA_approved",
                      "guideline",
                      "clinical_trial",
                      "preclinical",
                      "case_study",
                    ],
                    description: "Level of evidence",
                  },
                },
              },
            },
          },
          required: ["gene", "variant"],
        },
      },

      copyNumberVariations: {
        type: "array",
        description: "Copy number variations detected",
        items: {
          type: "object",
          properties: {
            gene: {
              type: "string",
              description: "Gene affected by CNV",
            },
            type: {
              type: "string",
              enum: ["amplification", "deletion", "gain", "loss"],
              description: "Type of copy number change",
            },
            copyNumber: {
              type: "string",
              description: "Estimated copy number",
            },
            significance: {
              type: "string",
              description: "Clinical significance of CNV",
            },
          },
        },
      },

      geneFusions: {
        type: "array",
        description: "Gene fusions detected",
        items: {
          type: "object",
          properties: {
            fusion: {
              type: "string",
              description: "Fusion description (e.g., BCR-ABL1)",
            },
            partner5: {
              type: "string",
              description: "5' fusion partner gene",
            },
            partner3: {
              type: "string",
              description: "3' fusion partner gene",
            },
            mechanism: {
              type: "string",
              description: "Fusion mechanism (translocation, inversion, etc.)",
            },
            therapeuticTargets: {
              type: "array",
              description: "Therapies targeting this fusion",
              items: {
                type: "string",
              },
            },
          },
        },
      },

      biomarkers: {
        type: "array",
        description: "Molecular biomarkers analyzed",
        items: {
          type: "object",
          properties: {
            biomarker: {
              type: "string",
              description: "Biomarker name (PD-L1, TMB, MSI, etc.)",
            },
            result: {
              type: "string",
              description: "Biomarker result",
            },
            units: {
              type: "string",
              description: "Units of measurement",
            },
            interpretation: {
              type: "string",
              enum: ["high", "intermediate", "low", "positive", "negative"],
              description: "Clinical interpretation",
            },
            threshold: {
              type: "string",
              description: "Clinical threshold used",
            },
            methodology: {
              type: "string",
              description: "Testing methodology",
            },
            clinicalUtility: {
              type: "string",
              description: "Clinical utility of biomarker",
            },
          },
          required: ["biomarker", "result"],
        },
      },

      microsatelliteInstability: {
        type: "object",
        description: "Microsatellite instability analysis",
        properties: {
          status: {
            type: "string",
            enum: ["MSI-H", "MSI-L", "MSS"],
            description: "MSI status",
          },
          methodology: {
            type: "string",
            enum: ["PCR", "NGS", "IHC"],
            description: "Testing method",
          },
          markers: {
            type: "array",
            description: "MSI markers tested",
            items: {
              type: "string",
            },
          },
          interpretation: {
            type: "string",
            description: "Clinical interpretation",
          },
        },
      },

      homologousRecombination: {
        type: "object",
        description: "Homologous recombination deficiency analysis",
        properties: {
          status: {
            type: "string",
            enum: ["deficient", "proficient", "indeterminate"],
            description: "HRD status",
          },
          score: {
            type: "string",
            description: "HRD score if applicable",
          },
          components: {
            type: "object",
            properties: {
              loh: {
                type: "string",
                description: "Loss of heterozygosity score. ONLY populate if explicitly stated in the document.",
              },
              tai: {
                type: "string",
                description: "Telomeric allelic imbalance score. ONLY populate if explicitly stated in the document.",
              },
              lst: {
                type: "string",
                description: "Large-scale state transitions score. ONLY populate if explicitly stated in the document.",
              },
            },
          },
        },
      },

      hereditaryTesting: {
        type: "object",
        description: "Hereditary cancer or genetic testing",
        properties: {
          genesTested: {
            type: "array",
            description: "Genes included in hereditary panel",
            items: {
              type: "string",
            },
          },
          pathogenicVariants: {
            type: "array",
            description: "Pathogenic variants identified",
            items: {
              type: "object",
              properties: {
                gene: {
                  type: "string",
                  description: "Gene name",
                },
                variant: {
                  type: "string",
                  description: "Variant description",
                },
                syndrome: {
                  type: "string",
                  description: "Associated genetic syndrome",
                },
                cancerRisks: {
                  type: "array",
                  description: "Associated cancer risks",
                  items: {
                    type: "object",
                    properties: {
                      cancer: {
                        type: "string",
                        description: "Cancer type",
                      },
                      riskLevel: {
                        type: "string",
                        description: "Risk level or percentage",
                      },
                    },
                  },
                },
                recommendations: {
                  type: "array",
                  description: "Screening/management recommendations",
                  items: {
                    type: "string",
                  },
                },
              },
            },
          },
          familyHistory: {
            type: "string",
            description: "Relevant family history provided",
          },
        },
      },

      pharmacogenomics: {
        type: "array",
        description: "Pharmacogenomic testing results",
        items: {
          type: "object",
          properties: {
            gene: {
              type: "string",
              description: "Pharmacogene (CYP2D6, TPMT, etc.)",
            },
            diplotype: {
              type: "string",
              description: "Diplotype result",
            },
            phenotype: {
              type: "string",
              description: "Predicted phenotype",
            },
            drugRecommendations: {
              type: "array",
              description: "Drug-specific recommendations",
              items: {
                type: "object",
                properties: {
                  drug: {
                    type: "string",
                    description: "Drug name",
                  },
                  recommendation: {
                    type: "string",
                    description: "Dosing or selection recommendation",
                  },
                },
              },
            },
          },
        },
      },

      liquidBiopsy: {
        type: "object",
        description: "Circulating tumor DNA analysis",
        properties: {
          ctdnaDetected: {
            type: "boolean",
            description: "Was circulating tumor DNA detected?",
          },
          variants: {
            type: "array",
            description: "Variants detected in ctDNA",
            items: {
              type: "object",
              properties: {
                gene: {
                  type: "string",
                  description: "Gene name",
                },
                variant: {
                  type: "string",
                  description: "Variant description",
                },
                alleleFrequency: {
                  type: "string",
                  description: "Circulating allele frequency. ONLY populate if explicitly stated in the document.",
                },
              },
            },
          },
          monitoringUtility: {
            type: "string",
            description: "Utility for treatment monitoring",
          },
        },
      },

      laboratoryDetails: {
        type: "object",
        properties: {
          performingLab: {
            type: "string",
            description: "Laboratory performing analysis",
          },
          accreditation: {
            type: "array",
            description: "Laboratory accreditations (CLIA, CAP, etc.)",
            items: {
              type: "string",
            },
          },
          sampleType: {
            type: "string",
            enum: [
              "FFPE_tissue",
              "fresh_tissue",
              "blood",
              "bone_marrow",
              "cerebrospinal_fluid",
              "other",
            ],
            description: "Sample type analyzed",
          },
          collectionDate: {
            type: "string",
            description: "Sample collection date (ISO format)",
          },
          reportDate: {
            type: "string",
            description: "Report date (ISO format)",
          },
        },
      },

      // Reuse core.diagnosis for associated diagnosis
      associatedDiagnosis: coreDiagnosis,

      // Additional performers (primary performer extracted by medical-analysis node)
      // Expected roles: pathologist_molecular, geneticist, oncologist, other_specialist
      interpretingSpecialist: corePerformer,

      clinicalTrialEligibility: {
        type: "array",
        description: "Clinical trials for which patient may be eligible",
        items: {
          type: "object",
          properties: {
            studyId: {
              type: "string",
              description: "Clinical trial identifier",
            },
            phase: {
              type: "string",
              description: "Trial phase",
            },
            intervention: {
              type: "string",
              description: "Study intervention",
            },
            targetBiomarker: {
              type: "string",
              description: "Relevant biomarker for eligibility",
            },
          },
        },
      },

      limitations: {
        type: "array",
        description: "Technical or analytical limitations",
        items: {
          type: "string",
        },
      },

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in molecular analysis extraction (0-1)",
      },
    },
    required: ["hasMolecular"],
  },
} as FunctionDefinition;
