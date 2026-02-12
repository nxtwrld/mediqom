/**
 * Get Document By ID Tool
 *
 * Retrieves a specific medical document by its unique identifier
 */

import {
  BaseMedicalTool,
  type MCPTool,
  type MCPToolResult,
} from "../base/base-tool";
import { logger } from "$lib/logging/logger";
import { getDocument } from "$lib/documents";

export class GetDocumentByIdTool extends BaseMedicalTool {
  getToolDefinition(): MCPTool {
    return {
      name: "getDocumentById",
      description:
        "Retrieve a specific medical document by its unique identifier. Use when you have a document ID from search results.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: {
            type: "string",
            description: "The unique identifier of the document to retrieve",
          },
        },
        required: ["documentId"],
      },
    };
  }

  async execute(params: any, profileId?: string): Promise<MCPToolResult> {
    try {
      const document = await getDocument(params.documentId);
      if (!document) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Document not found",
            },
          ],
          isError: true,
        };
      }

      const sanitizedDoc = {
        id: document.id,
        type: document.type,
        metadata: document.metadata,
        content: this.sanitizeContentForAI(document.content),
        author_id: document.author_id,
        created: document.metadata?.date,
      };

      let docText =
        `**Document: ${document.metadata?.title || "Untitled"}**\n\n` +
        `Type: ${document.type}\n` +
        `Date: ${document.metadata?.date || "Unknown"}\n` +
        `Category: ${document.metadata?.category || "Unknown"}\n`;

      // Add medical terms if available
      if (document.medicalTerms && document.medicalTerms.length > 0) {
        docText += `Medical Terms: ${document.medicalTerms.join(", ")}\n`;
      }

      // Add tags if available
      if (document.metadata?.tags && document.metadata.tags.length > 0) {
        docText += `Tags: ${document.metadata.tags.join(", ")}\n`;
      }

      docText += `\nContent:\n${this.formatDocumentContent(document.content)}`;

      return {
        content: [
          {
            type: "text",
            text: docText,
          },
          {
            type: "resource",
            resource: sanitizedDoc,
          },
        ],
      };
    } catch (error) {
      logger.namespace("Context")?.error("Failed to get document", {
        error: error instanceof Error ? error.message : "Unknown error",
        documentId: params.documentId,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Document access failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Sanitize document content for AI consumption
   */
  private sanitizeContentForAI(content: any): any {
    if (typeof content === "string") {
      return content;
    }

    if (typeof content === "object" && content !== null) {
      // Remove any sensitive fields
      const sanitized = { ...content };
      delete sanitized.encryptedData;
      delete sanitized.privateKey;
      delete sanitized.internalNotes;

      return sanitized;
    }

    return content;
  }

  /**
   * Format document content for readable display
   */
  private formatDocumentContent(content: any): string {
    if (typeof content === "string") {
      return content;
    }

    if (typeof content === "object" && content !== null) {
      // Check for common medical document structures
      if (content.findings || content.diagnosis || content.treatment) {
        let formatted = "";

        if (content.findings) {
          formatted += `**Findings:**\n${this.formatSection(content.findings)}\n\n`;
        }

        if (content.diagnosis) {
          formatted += `**Diagnosis:**\n${this.formatSection(content.diagnosis)}\n\n`;
        }

        if (content.treatment) {
          formatted += `**Treatment:**\n${this.formatSection(content.treatment)}\n\n`;
        }

        if (content.recommendations) {
          formatted += `**Recommendations:**\n${this.formatSection(content.recommendations)}\n\n`;
        }

        return formatted;
      }

      // Default to JSON for other structures
      return JSON.stringify(content, null, 2);
    }

    return String(content);
  }

  /**
   * Format a section of content
   */
  private formatSection(section: any): string {
    if (typeof section === "string") {
      return section;
    }

    if (Array.isArray(section)) {
      return section.map((item) => `• ${this.formatSection(item)}`).join("\n");
    }

    if (typeof section === "object" && section !== null) {
      return Object.entries(section)
        .map(([key, value]) => `${key}: ${this.formatSection(value)}`)
        .join("\n");
    }

    return String(section);
  }
}
