/**
 * LangGraph Node: Medical Terms Generation
 *
 * Generates unified medical terms array by aggregating existing analysis results
 * without additional AI calls. Replaces the embedding generation system.
 */

import type { DocumentProcessingState } from "../state";
import type { TemporalType } from "$lib/documents/types";
import { logger } from "$lib/logging/logger";
import BODY_PARTS from "$lib/configurations/tags";

/**
 * Generate unified medical terms for document search
 */
export async function medicalTermsGenerationNode(
  state: DocumentProcessingState,
): Promise<Partial<DocumentProcessingState>> {
  try {
    logger
      .namespace("MedicalTermsGeneration")
      .info("Starting medical terms generation", {
        hasMultiNodeResults: !!state.multiNodeResults,
        hasReport: !!state.report,
        language: state.language,
      });

    // Emit progress
    state.emitProgress?.(
      "medical_terms_generation",
      0,
      "Analyzing existing medical analysis results",
    );

    // Check if we have sufficient analysis results
    if (!state.multiNodeResults || !state.report) {
      logger
        .namespace("MedicalTermsGeneration")
        .warn("Insufficient analysis results for medical terms generation", {
          hasMultiNodeResults: !!state.multiNodeResults,
          hasReport: !!state.report,
        });

      return {
        medicalTermsGeneration: {
          skipped: true,
          reason: "Insufficient analysis results",
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Check if this is medical content worth processing
    const isMedical =
      state.featureDetectionResults?.isMedical ||
      (state.featureDetection && state.featureDetection.confidence > 0.5);

    if (!isMedical) {
      logger
        .namespace("MedicalTermsGeneration")
        .info("Skipping medical terms for non-medical content");

      return {
        medicalTermsGeneration: {
          skipped: true,
          reason: "Non-medical content",
          timestamp: new Date().toISOString(),
        },
      };
    }

    state.emitProgress?.(
      "medical_terms_generation",
      25,
      "Extracting medical terms from analysis results",
    );

    // Aggregate medical terms from all analysis results
    const medicalTerms: Set<string> = new Set();

    // 1. Extract category terms from document type analysis
    if (state.documentTypeAnalysis?.documentType) {
      medicalTerms.add(state.documentTypeAnalysis.documentType.toLowerCase());
    }

    if (state.documentTypeAnalysis?.medicalSpecialty) {
      state.documentTypeAnalysis.medicalSpecialty.forEach((specialty) => {
        medicalTerms.add(specialty.toLowerCase());
      });
    }

    // 2. Extract body parts from existing analysis
    if (state.report?.bodyParts) {
      state.report.bodyParts.forEach((bodyPart: any) => {
        if (bodyPart.identification) {
          medicalTerms.add(bodyPart.identification.toLowerCase());
        }
      });
    }

    // 3. Extract diagnosis codes and keywords
    if (state.report?.diagnosis) {
      state.report.diagnosis.forEach((diagnosis: any) => {
        if (diagnosis.code) {
          medicalTerms.add(diagnosis.code.toUpperCase()); // ICD-10 codes in uppercase
        }
        if (diagnosis.searchKeywords) {
          diagnosis.searchKeywords.forEach((keyword: string) => {
            medicalTerms.add(keyword.toLowerCase());
          });
        }
      });
    }

    // 4. Extract procedure terms
    if (state.report?.procedures?.procedures) {
      state.report.procedures.procedures.forEach((procedure: any) => {
        if (procedure.name) {
          medicalTerms.add(procedure.name.toLowerCase());
        }
        if (procedure.cptCode) {
          medicalTerms.add(procedure.cptCode.toUpperCase());
        }
        if (procedure.procedureCategory) {
          medicalTerms.add(procedure.procedureCategory.toLowerCase());
        }
        if (procedure.searchKeywords) {
          procedure.searchKeywords.forEach((keyword: string) => {
            medicalTerms.add(keyword.toLowerCase());
          });
        }
      });
    }

    // 5. Extract medication terms
    if (state.report?.medications) {
      ["newPrescriptions", "currentMedications"].forEach((medicationType) => {
        if (state.report.medications[medicationType]) {
          state.report.medications[medicationType].forEach(
            (medication: any) => {
              if (medication.medicationName) {
                medicalTerms.add(medication.medicationName.toLowerCase());
              }
              if (medication.genericName) {
                medicalTerms.add(medication.genericName.toLowerCase());
              }
              if (medication.therapeuticClass) {
                medication.therapeuticClass.forEach(
                  (therapeuticClass: string) => {
                    medicalTerms.add(therapeuticClass.toLowerCase());
                  },
                );
              }
              if (medication.searchTerms) {
                medication.searchTerms.forEach((term: string) => {
                  medicalTerms.add(term.toLowerCase());
                });
              }
            },
          );
        }
      });
    }

    // 6. Extract laboratory/signals terms
    if (state.signals) {
      state.signals.forEach((signal: any) => {
        if (signal.signal) {
          medicalTerms.add(signal.signal.toLowerCase());
        }
        if (signal.labCategory) {
          medicalTerms.add(signal.labCategory.toLowerCase());
        }
        if (signal.searchTerms) {
          signal.searchTerms.forEach((term: string) => {
            medicalTerms.add(term.toLowerCase());
          });
        }
      });
    }

    // 7. Extract imaging terms
    if (state.report?.imaging) {
      if (state.report.imaging.imagingCategory) {
        medicalTerms.add(state.report.imaging.imagingCategory.toLowerCase());
      }
      if (state.report.imaging.searchKeywords) {
        state.report.imaging.searchKeywords.forEach((keyword: string) => {
          medicalTerms.add(keyword.toLowerCase());
        });
      }
    }

    state.emitProgress?.(
      "medical_terms_generation",
      50,
      "Determining temporal classification",
    );

    // 8. Determine temporal type based on content analysis
    const temporalType = determineTemporalType(state);

    // Add temporal terms
    medicalTerms.add(temporalType);

    state.emitProgress?.(
      "medical_terms_generation",
      75,
      "Finalizing medical terms array",
    );

    // Convert to array and filter out empty terms
    const finalMedicalTerms = Array.from(medicalTerms)
      .filter((term) => term && term.trim().length > 0)
      .sort(); // Sort for consistency

    state.emitProgress?.(
      "medical_terms_generation",
      100,
      "Medical terms generation completed",
    );

    logger
      .namespace("MedicalTermsGeneration")
      .info("Medical terms generation completed successfully", {
        termsCount: finalMedicalTerms.length,
        temporalType,
        sampleTerms: finalMedicalTerms.slice(0, 10),
      });

    // Return medical terms data to be stored with document
    return {
      medicalTermsGeneration: {
        success: true,
        termsCount: finalMedicalTerms.length,
        temporalType,
        timestamp: new Date().toISOString(),
        // Store the medical terms data for document storage
        medicalTermsData: {
          medicalTerms: finalMedicalTerms,
          temporalType,
          metadata: {
            language: state.language || "en",
            documentType:
              state.documentTypeAnalysis?.documentType || "document",
            processingDate: new Date().toISOString(),
            extractionMethod: "aggregated_analysis",
          },
        },
      },
    };
  } catch (error) {
    logger
      .namespace("MedicalTermsGeneration")
      .error("Medical terms generation node error", {
        error: error instanceof Error ? error.message : String(error),
      });

    return {
      medicalTermsGeneration: {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown medical terms generation error",
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Determine temporal type based on document content and metadata
 */
function determineTemporalType(state: DocumentProcessingState): TemporalType {
  // Check for explicit temporal indicators in the document
  const text = state.text?.toLowerCase() || "";
  const now = new Date();

  // Look for date information in analysis results
  const documentDate = extractDocumentDate(state);

  if (documentDate) {
    const daysDiff = Math.floor(
      (now.getTime() - documentDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Latest: within 7 days
    if (daysDiff <= 7) {
      return "latest" as TemporalType;
    }

    // Recent: within 30 days
    if (daysDiff <= 30) {
      return "recent" as TemporalType;
    }
  }

  // Check for temporal keywords
  const latestKeywords = [
    "latest",
    "newest",
    "most recent",
    "last",
    "current",
    "poslední",
    "nejnovější",
    "aktuální",
    "neueste",
    "letzte",
    "aktuellste",
  ];

  const recentKeywords = [
    "recent",
    "recently",
    "this month",
    "past month",
    "new",
    "nedávné",
    "nedávno",
    "tento měsíc",
    "kürzlich",
    "neulich",
    "diesen monat",
  ];

  if (latestKeywords.some((keyword) => text.includes(keyword))) {
    return "latest" as TemporalType;
  }

  if (recentKeywords.some((keyword) => text.includes(keyword))) {
    return "recent" as TemporalType;
  }

  // Default to historical for older documents
  return "historical" as TemporalType;
}

/**
 * Extract document date from analysis results
 */
function extractDocumentDate(state: DocumentProcessingState): Date | null {
  // Try to get date from various sources in the analysis

  // 1. Check report metadata
  if (state.report?.date) {
    const date = new Date(state.report.date);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // 2. Check diagnosis dates
  if (state.report?.diagnosis) {
    for (const diagnosis of state.report.diagnosis) {
      if (diagnosis.date) {
        const date = new Date(diagnosis.date);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  }

  // 3. Check signals/lab dates
  if (state.signals) {
    for (const signal of state.signals) {
      if (signal.date) {
        const date = new Date(signal.date);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  }

  // 4. Check procedures dates
  if (state.report?.procedures?.procedures) {
    for (const procedure of state.report.procedures.procedures) {
      if (procedure.startTime) {
        const date = new Date(procedure.startTime);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  }

  // 5. Check medication dates
  if (state.report?.medications?.newPrescriptions) {
    for (const prescription of state.report.medications.newPrescriptions) {
      if (prescription.prescriptionDate) {
        const date = new Date(prescription.prescriptionDate);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  }

  return null;
}
