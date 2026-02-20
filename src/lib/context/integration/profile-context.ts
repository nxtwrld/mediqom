/**
 * Profile Context Integration
 *
 * Simplified version that works with medical terms classification system.
 * Manages document loading and medical terms processing for profiles.
 */

// Removed embedding system imports - now using medical terms classification
import { byUser } from "$lib/documents";
import type { Document, DocumentPreload } from "$lib/documents/types.d";
import { get } from "svelte/store";
import user from "$lib/user";
import { logger } from "$lib/logging/logger";

export class ProfileContextManager {
  private initializationPromises = new Map<string, Promise<void>>();
  private initializedProfiles = new Set<string>();

  /**
   * Initialize context for a profile using documents with medical terms
   * This is now a simplified version that ensures documents are loaded
   */
  async initializeProfileContext(
    profileId: string,
    options: {
      onProgress?: (message: string, progress: number) => void;
      forceReinitialize?: boolean;
      includePreload?: boolean;
    } = {},
  ): Promise<void> {
    // Check if already initialized (and not forced to reinitialize)
    if (this.initializedProfiles.has(profileId) && !options.forceReinitialize) {
      return;
    }

    // Check if already initializing
    if (
      this.initializationPromises.has(profileId) &&
      !options.forceReinitialize
    ) {
      return await this.initializationPromises.get(profileId)!;
    }

    const initPromise = this._performInitialization(profileId, options);
    this.initializationPromises.set(profileId, initPromise);

    try {
      await initPromise;
      // Mark as initialized after successful completion
      this.initializedProfiles.add(profileId);
    } finally {
      this.initializationPromises.delete(profileId);
    }
  }

  private async _performInitialization(
    profileId: string,
    options: {
      onProgress?: (message: string, progress: number) => void;
      forceReinitialize?: boolean;
      includePreload?: boolean;
    },
  ): Promise<void> {
    try {
      logger
        .namespace("ProfileContext")
        .info("Initializing profile context with medical terms", {
          profileId,
          includePreload: options.includePreload,
        });

      options.onProgress?.("Loading profile documents...", 10);

      // Get documents for the profile
      const userDocuments = get(byUser(profileId)) as (
        | DocumentPreload
        | Document
      )[];

      if (!userDocuments || userDocuments.length === 0) {
        logger
          .namespace("ProfileContext")
          .info("No documents found for profile", { profileId });
        options.onProgress?.("No documents found", 100);
        return;
      }

      options.onProgress?.("Processing documents...", 50);

      // Filter for documents that have medical terms or content
      const processedDocuments = userDocuments.filter((doc) => {
        return doc.medicalTerms || (doc as Document).content;
      });

      logger
        .namespace("ProfileContext")
        .info("Profile context initialization completed", {
          profileId,
          totalDocuments: userDocuments.length,
          processedDocuments: processedDocuments.length,
        });

      options.onProgress?.("Profile context ready", 100);
    } catch (error) {
      logger
        .namespace("ProfileContext")
        .error("Failed to initialize profile context", {
          profileId,
          error: error instanceof Error ? error.message : String(error),
        });
      throw error;
    }
  }

  /**
   * Check if profile context is ready
   */
  isContextReady(profileId: string): boolean {
    const documents = get(byUser(profileId));
    return documents && documents.length > 0;
  }

  /**
   * Get context statistics for a profile
   */
  getContextStats(profileId: string) {
    const documents = get(byUser(profileId));
    const documentsWithTerms = documents.filter(
      (doc) => doc.medicalTerms && doc.medicalTerms.length > 0,
    );

    return {
      totalDocuments: documents.length,
      documentsWithMedicalTerms: documentsWithTerms.length,
      isReady: this.isContextReady(profileId),
      // TODO: Replace embedding-based search with medical terms classification search
      database: {
        search: async (_embedding: any, _options: any) => {
          // Placeholder: Return documents with medical terms as fallback
          return documentsWithTerms.map((doc) => ({
            documentId: doc.id,
            similarity: 0.7, // Placeholder similarity
            relevanceScore: 0.7, // Placeholder relevance
            metadata: {
              documentId: doc.id,
              summary: doc.metadata?.title || "Untitled",
              title: doc.metadata?.title || "Untitled",
              date: (doc as any).created_at || new Date().toISOString(),
              documentType: doc.type,
            },
            excerpt:
              typeof doc.content === "string"
                ? doc.content.substring(0, 200)
                : "",
          }));
        },
      },
    };
  }

  /**
   * Refresh context for a profile
   */
  async refreshContext(profileId: string): Promise<void> {
    return this.initializeProfileContext(profileId, {
      forceReinitialize: true,
    });
  }

  /**
   * Clean up context for a profile
   */
  cleanupContext(profileId: string): void {
    this.initializationPromises.delete(profileId);
    this.initializedProfiles.delete(profileId);
    logger
      .namespace("ProfileContext")
      .info("Cleaned up context for profile", { profileId });
  }

  /**
   * Add document to context (simplified version for medical terms system)
   */
  async addDocumentToContext(
    profileId: string,
    document: Document,
  ): Promise<void> {
    logger.namespace("ProfileContext").info("Document added to context", {
      profileId,
      documentId: document.id,
      hasMedicalTerms: !!document.medicalTerms?.length,
    });
    // In the medical terms system, documents are automatically available once processed
    // No additional context database operations needed
  }

  /**
   * Remove document from context (simplified version for medical terms system)
   */
  async removeDocumentFromContext(
    profileId: string,
    documentId: string,
  ): Promise<void> {
    logger.namespace("ProfileContext").info("Document removed from context", {
      profileId,
      documentId,
    });
    // In the medical terms system, documents are automatically removed when deleted
    // No additional context database operations needed
  }
}

// Export singleton instance
export const profileContextManager = new ProfileContextManager();
