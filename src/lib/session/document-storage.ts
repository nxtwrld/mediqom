/**
 * Session Document Storage
 * Handles conversion and storage of session analysis data as documents
 */

import type { SessionAnalysis } from "$components/session/types/visualization";
import type { DocumentNew } from "$lib/documents/types.d";
import { DocumentType } from "$lib/documents/types.d";
import { addDocument } from "$lib/documents";
import { logger } from "$lib/logging/logger";

/**
 * Converts a session analysis into a document for permanent storage
 */
export async function saveSessionAsDocument(
  analysis: SessionAnalysis,
  transcript: any[],
  patientId: string,
  performerId: string,
  performerName: string,
  sessionDuration?: number,
): Promise<string> {
  try {
    logger.session.debug("Saving session as document", {
      hasAnalysis: !!analysis,
      analysisNodes: analysis?.nodes ? Object.keys(analysis.nodes) : [],
      transcriptLength: transcript?.length || 0,
      patientId,
      performerId,
    });

    // Generate document title and tags
    const sessionDate = new Date(analysis.timestamp);
    const formattedDate = sessionDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedTime = sessionDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const title = `Medical Session - ${formattedDate} at ${formattedTime}`;

    // Create document content with sessionAnalysis containing transcript and analysis children
    const documentContent = {
      title,
      tags: ["Medical Session", "Consultation", performerName, formattedDate],

      // Store sessionAnalysis with transcript and analysis children
      sessionAnalysis: {
        transcript: transcript || [],
        analysis: analysis,
      },

      // Default summary for now
      summary:
        "Medical consultation session completed. Full analysis available in session view.",

      // Performer information
      performer: {
        id: performerId,
        name: performerName,
        role: "Healthcare Provider",
      },
    };

    // Create metadata
    const metadata = {
      sessionDate: analysis.timestamp,
      duration: sessionDuration || 0,
      analysisVersion: analysis.analysisVersion,
      performerId,
      performerName,
      patientId,
    };

    // Create document object
    const newDocument: DocumentNew = {
      type: DocumentType.document,
      user_id: patientId,
      content: documentContent,
      metadata,
    };

    // Save document
    const savedDocument = await addDocument(newDocument);

    logger.session.info("Session saved as document", {
      documentId: savedDocument.id,
      sessionId: analysis.sessionId,
      patientId,
      performerId,
    });

    return savedDocument.id;
  } catch (error) {
    logger.session.error("Failed to save session as document", {
      error: error instanceof Error ? error.message : String(error),
      sessionId: analysis.sessionId,
    });
    throw error;
  }
}

/**
 * Loads a session from a document
 */
export function loadSessionFromDocument(document: any): SessionAnalysis | null {
  if (!document?.content?.sessionAnalysis?.analysis) {
    logger.session.warn("Document does not contain session analysis data", {
      documentId: document?.id,
    });
    return null;
  }

  return document.content.sessionAnalysis.analysis;
}

/**
 * Checks if a document contains session analysis data
 */
export function isSessionDocument(document: any): boolean {
  return !!document?.content?.sessionAnalysis?.analysis;
}
