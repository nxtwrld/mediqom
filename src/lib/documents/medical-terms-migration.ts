/**
 * Medical Terms Migration System
 *
 * Migrates existing documents by extracting medical terms from existing report analysis fields.
 * This is much faster than re-running the LangGraph workflow.
 */

import { byUser, getDocument, updateDocument } from "$lib/documents";
import type { Document, DocumentPreload } from "$lib/documents/types.d";
import { logger } from "$lib/logging/logger";
import { get } from "svelte/store";
import { TemporalType } from "$lib/documents/types.d";

export interface MigrationOptions {
  batchSize?: number;
  onProgress?: (processed: number, total: number, currentDoc?: string) => void;
  onError?: (documentId: string, error: string) => void;
  skipExisting?: boolean;
}

export interface MigrationResult {
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ documentId: string; error: string }>;
}

export class MedicalTermsMigration {
  /**
   * Migrate documents for a specific profile by extracting terms from existing reports
   */
  async migrateProfileDocuments(
    profileId: string,
    options: MigrationOptions = {},
  ): Promise<MigrationResult> {
    const {
      batchSize = 10,
      onProgress,
      onError,
      skipExisting = true,
    } = options;

    logger
      .namespace("MedicalTermsMigration")
      .info("Starting profile migration from existing reports", {
        profileId,
        batchSize,
        skipExisting,
      });

    // Get all documents for the profile
    const userDocuments = get(byUser(profileId)) as (
      | DocumentPreload
      | Document
    )[];

    // Filter documents that need migration
    const documentsToMigrate = userDocuments.filter((doc) => {
      // Skip preload documents without content
      if (!("content" in doc) || !doc.content) {
        return false;
      }

      // Skip if document already has medical terms and skipExisting is true
      if (skipExisting && doc.medicalTerms && doc.medicalTerms.length > 0) {
        return false;
      }

      // Only migrate documents that have existing report analysis
      return !!(doc as Document).report;
    }) as Document[];

    if (documentsToMigrate.length === 0) {
      logger
        .namespace("MedicalTermsMigration")
        .info("No documents need migration", {
          profileId,
          totalDocuments: userDocuments.length,
        });
      return {
        processed: 0,
        updated: 0,
        skipped: userDocuments.length,
        failed: 0,
        errors: [],
      };
    }

    logger
      .namespace("MedicalTermsMigration")
      .info("Found documents to migrate", {
        profileId,
        documentsToMigrate: documentsToMigrate.length,
        totalDocuments: userDocuments.length,
      });

    const result: MigrationResult = {
      processed: 0,
      updated: 0,
      skipped: userDocuments.length - documentsToMigrate.length,
      failed: 0,
      errors: [],
    };

    // Process documents in batches
    for (let i = 0; i < documentsToMigrate.length; i += batchSize) {
      const batch = documentsToMigrate.slice(i, i + batchSize);

      for (const doc of batch) {
        try {
          const migrationResult = await this.migrateDocumentFromReport(doc);
          result.processed++;

          if (migrationResult.updated) {
            result.updated++;
            logger
              .namespace("MedicalTermsMigration")
              .debug("Document migrated successfully", {
                documentId: doc.id,
                medicalTermsCount: migrationResult.medicalTermsCount,
              });
          }

          // Report progress
          onProgress?.(
            result.processed,
            documentsToMigrate.length,
            doc.content?.title || doc.metadata?.summary,
          );
        } catch (error) {
          result.failed++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          result.errors.push({ documentId: doc.id, error: errorMessage });
          onError?.(doc.id, errorMessage);

          logger
            .namespace("MedicalTermsMigration")
            .error("Document migration failed", {
              documentId: doc.id,
              error: errorMessage,
            });

          result.processed++;
        }
      }
    }

    logger
      .namespace("MedicalTermsMigration")
      .info("Profile migration completed", {
        profileId,
        ...result,
      });

    return result;
  }

  /**
   * Extract medical terms from existing report analysis
   */
  private async migrateDocumentFromReport(
    document: Document,
  ): Promise<{ updated: boolean; medicalTermsCount?: number }> {
    try {
      if (!document.report) {
        throw new Error(
          "Document has no report analysis to extract terms from",
        );
      }

      const medicalTerms = new Set<string>();
      let temporalType: TemporalType | undefined;

      // Extract from diagnosis analysis
      if (document.report.diagnosis?.diagnoses) {
        for (const diagnosis of document.report.diagnosis.diagnoses) {
          if (diagnosis.name) medicalTerms.add(diagnosis.name.toLowerCase());
          if (diagnosis.icdCode) medicalTerms.add(diagnosis.icdCode);
          if (diagnosis.category)
            medicalTerms.add(diagnosis.category.toLowerCase());
        }
      }

      // Extract from procedures
      if (document.report.procedures?.procedures) {
        for (const procedure of document.report.procedures.procedures) {
          if (procedure.name) medicalTerms.add(procedure.name.toLowerCase());
          if (procedure.cptCode) medicalTerms.add(procedure.cptCode);
          if (procedure.category)
            medicalTerms.add(procedure.category.toLowerCase());
        }
      }

      // Extract from medications
      if (document.report.medications?.medications) {
        for (const medication of document.report.medications.medications) {
          if (medication.name) medicalTerms.add(medication.name.toLowerCase());
          if (medication.genericName)
            medicalTerms.add(medication.genericName.toLowerCase());
          if (medication.category)
            medicalTerms.add(medication.category.toLowerCase());
          if (medication.activeIngredient)
            medicalTerms.add(medication.activeIngredient.toLowerCase());
        }
      }

      // Extract from lab/signals
      if (document.report.signals?.signals) {
        for (const signal of document.report.signals.signals) {
          if (signal.name) medicalTerms.add(signal.name.toLowerCase());
          if (signal.category) medicalTerms.add(signal.category.toLowerCase());
          if (signal.loincCode) medicalTerms.add(signal.loincCode);
          if (signal.unit) medicalTerms.add(signal.unit.toLowerCase());
        }
      }

      // Extract from imaging
      if (document.report.imaging?.studies) {
        for (const study of document.report.imaging.studies) {
          if (study.type) medicalTerms.add(study.type.toLowerCase());
          if (study.bodyPart) medicalTerms.add(study.bodyPart.toLowerCase());
          if (study.technique) medicalTerms.add(study.technique.toLowerCase());
        }
      }

      // Extract body parts from anatomy analysis
      if (document.report.anatomy?.bodyParts) {
        for (const bodyPart of document.report.anatomy.bodyParts) {
          if (bodyPart.name) medicalTerms.add(bodyPart.name.toLowerCase());
        }
      }

      // Determine temporal type from document metadata or content
      const documentText =
        (document.content?.title || "") + " " + (document.content?.text || "");
      const textLower = documentText.toLowerCase();

      if (
        textLower.includes("latest") ||
        textLower.includes("current") ||
        textLower.includes("recent")
      ) {
        temporalType = TemporalType.LATEST;
      } else if (
        textLower.includes("previous") ||
        textLower.includes("historical") ||
        textLower.includes("past")
      ) {
        temporalType = TemporalType.HISTORICAL;
      }

      // Add document type category terms
      if (document.metadata?.documentType) {
        medicalTerms.add(document.metadata.documentType.toLowerCase());
      }

      // Add common medical categories based on document content
      const categories = this.detectMedicalCategories(document.report);
      categories.forEach((category) => medicalTerms.add(category));

      if (medicalTerms.size === 0) {
        logger
          .namespace("MedicalTermsMigration")
          .warn("No medical terms extracted from document report", {
            documentId: document.id,
          });
        return { updated: false };
      }

      // Update document with extracted medical terms
      const updatedDocument: Document = {
        ...document,
        medicalTerms: Array.from(medicalTerms),
        temporalType: temporalType,
      };

      // Save updated document
      await updateDocument(updatedDocument);

      return {
        updated: true,
        medicalTermsCount: updatedDocument.medicalTerms?.length || 0,
      };
    } catch (error) {
      throw new Error(
        `Failed to migrate document ${document.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Detect medical categories based on report content
   */
  private detectMedicalCategories(report: any): string[] {
    const categories: string[] = [];

    if (report.diagnosis?.diagnoses?.length > 0) categories.push("diagnosis");
    if (report.procedures?.procedures?.length > 0)
      categories.push("procedure", "surgery");
    if (report.medications?.medications?.length > 0)
      categories.push("medication", "prescription");
    if (report.signals?.signals?.length > 0)
      categories.push("laboratory", "test", "results");
    if (report.imaging?.studies?.length > 0)
      categories.push("imaging", "radiology");
    if (report.anatomy?.bodyParts?.length > 0) categories.push("anatomy");

    // Add specialty-specific terms
    if (
      report.diagnosis?.diagnoses?.some((d: any) =>
        d.category?.toLowerCase().includes("cardio"),
      )
    ) {
      categories.push("cardiology", "heart", "cardiac");
    }

    if (
      report.imaging?.studies?.some((s: any) =>
        s.type?.toLowerCase().includes("x-ray"),
      )
    ) {
      categories.push("x-ray");
    }

    if (
      report.imaging?.studies?.some((s: any) =>
        s.type?.toLowerCase().includes("mri"),
      )
    ) {
      categories.push("mri");
    }

    return categories;
  }

  /**
   * Check migration status for a profile
   */
  async getMigrationStatus(profileId: string): Promise<{
    totalDocuments: number;
    documentsWithReports: number;
    documentsWithTerms: number;
    documentsNeedingMigration: number;
    migrationComplete: boolean;
  }> {
    const userDocuments = get(byUser(profileId)) as (
      | DocumentPreload
      | Document
    )[];
    const documentsWithContent = userDocuments.filter(
      (doc) => "content" in doc && doc.content,
    ) as Document[];
    const documentsWithReports = documentsWithContent.filter(
      (doc) => doc.report,
    );
    const documentsWithTerms = documentsWithContent.filter(
      (doc) => doc.medicalTerms && doc.medicalTerms.length > 0,
    );
    const documentsNeedingMigration = documentsWithReports.filter(
      (doc) => !doc.medicalTerms || doc.medicalTerms.length === 0,
    );

    return {
      totalDocuments: userDocuments.length,
      documentsWithReports: documentsWithReports.length,
      documentsWithTerms: documentsWithTerms.length,
      documentsNeedingMigration: documentsNeedingMigration.length,
      migrationComplete: documentsNeedingMigration.length === 0,
    };
  }
}

// Export singleton instance
export const medicalTermsMigration = new MedicalTermsMigration();
