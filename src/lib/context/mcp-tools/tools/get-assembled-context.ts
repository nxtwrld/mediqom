/**
 * Get Assembled Context Tool
 *
 * Assembles relevant medical context from patient documents for AI analysis
 */

import {
  BaseMedicalTool,
  type MCPTool,
  type MCPToolResult,
} from "../base/base-tool";
import type { AssembledContext } from "../base/types";
import { logger } from "$lib/logging/logger";
import { profileContextManager } from "$lib/context/integration/profile-context";
import { contextAssembler } from "$lib/context/context-assembly/context-composer";

export class GetAssembledContextTool extends BaseMedicalTool {
  getToolDefinition(): MCPTool {
    return {
      name: "getAssembledContext",
      description:
        "Assemble relevant medical context from patient documents based on current conversation. Returns summarized context with key medical points and relevant documents.",
      inputSchema: {
        type: "object",
        properties: {
          conversationContext: {
            type: "string",
            description:
              "Current conversation context to search for relevant medical history",
          },
          maxTokens: {
            type: "number",
            description: "Maximum tokens for assembled context (default: 3000)",
          },
          includeMedicalContext: {
            type: "boolean",
            description:
              "Include structured medical context (conditions, medications, procedures) (default: true)",
          },
          priorityTypes: {
            type: "array",
            items: { type: "string" },
            description:
              "Document types to prioritize in assembly (e.g., ['lab-results', 'prescriptions'])",
          },
        },
        required: ["conversationContext"],
      },
    };
  }

  async execute(params: any, profileId: string): Promise<MCPToolResult> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.generateQueryEmbedding(
        params.conversationContext,
      );

      // Get context stats
      const contextStats =
        profileContextManager.getProfileContextStats(profileId);
      if (!contextStats) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No context available for this profile. Please ensure documents are loaded and context is initialized.",
            },
          ],
          isError: true,
        };
      }

      // Search for relevant context
      const searchResults = await contextStats.database.search(queryEmbedding, {
        limit: 20,
        threshold: 0.6,
        includeMetadata: true,
      });

      // Assemble context
      const assembledContext = await contextAssembler.assembleContextForAI(
        searchResults,
        params.conversationContext,
        {
          maxTokens: params.maxTokens || 3000,
          includeMetadata: true,
          includeMedicalContext: params.includeMedicalContext ?? true,
          priorityTypes: params.priorityTypes,
        },
      );

      const contextData: AssembledContext = {
        summary: assembledContext.summary,
        keyFindings: assembledContext.keyPoints.map((kp: any) => kp.text),
        relevantDocuments: assembledContext.relevantDocuments.map((doc: any) => ({
          document: {
            id: doc.documentId,
            metadata: { type: doc.type, date: doc.date },
          },
          relevance: doc.relevance,
          matchedTerms: [],
          excerpt: doc.excerpt,
        })),
        temporalContext: {
          recent: assembledContext.keyPoints
            .filter((kp: any) => this.isRecent(kp.date))
            .map((kp: any) => kp.text),
          historical: assembledContext.keyPoints
            .filter((kp: any) => !this.isRecent(kp.date))
            .map((kp: any) => kp.text),
        },
        medicalContext: assembledContext.medicalContext,
        metadata: {
          assemblyTime: Date.now(),
          documentCount: assembledContext.relevantDocuments.length,
          confidence: assembledContext.confidence,
        },
      };

      return {
        content: [
          {
            type: "text",
            text: `Assembled medical context:\n\n**Summary:** ${assembledContext.summary}\n\n**Key Points:** ${assembledContext.keyPoints.length} relevant medical points identified\n\n**Relevant Documents:** ${assembledContext.relevantDocuments.length} documents found\n\n**Confidence:** ${(assembledContext.confidence * 100).toFixed(1)}%`,
          },
          {
            type: "resource",
            resource: contextData,
          },
        ],
      };
    } catch (error) {
      logger.namespace("Context")?.error("Failed to assemble context", {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Context assembly failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Generate query embedding - placeholder for actual implementation
   */
  private async generateQueryEmbedding(query: string): Promise<any> {
    // TODO: Implement actual embedding generation
    // This would typically use an embedding model
    return query;
  }

  /**
   * Check if a date is recent (within 30 days)
   */
  private isRecent(dateStr?: string): boolean {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return date >= thirtyDaysAgo;
  }
}
