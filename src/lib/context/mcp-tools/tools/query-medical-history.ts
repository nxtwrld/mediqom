/**
 * Query Medical History Tool
 *
 * Queries specific types of medical information from patient history
 */

import {
  BaseMedicalTool,
  type MCPTool,
  type MCPToolResult,
} from "../base/base-tool";
import { logger } from "$lib/logging/logger";
import { profileContextManager } from "$lib/context/integration/profile-context";

export class QueryMedicalHistoryTool extends BaseMedicalTool {
  getToolDefinition(): MCPTool {
    return {
      name: "queryMedicalHistory",
      description:
        "Query specific types of medical information from patient history. Use when you need to find medications, conditions, procedures, allergies, or build a medical timeline.",
      inputSchema: {
        type: "object",
        properties: {
          queryType: {
            type: "string",
            enum: [
              "medications",
              "conditions",
              "procedures",
              "allergies",
              "timeline",
            ],
            description: "Type of medical information to query",
          },
          timeframe: {
            type: "object",
            properties: {
              start: { type: "string", format: "date" },
              end: { type: "string", format: "date" },
            },
            description:
              "Optional time range to filter results (ISO date format)",
          },
        },
        required: ["queryType"],
      },
    };
  }

  async execute(params: any, profileId: string): Promise<MCPToolResult> {
    try {
      const contextStats =
        profileContextManager.getProfileContextStats(profileId);
      if (!contextStats) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No medical history context available",
            },
          ],
          isError: true,
        };
      }

      // Build type-specific query
      let query = "";
      switch (params.queryType) {
        case "medications":
          query = "medications prescriptions drugs dosage treatment pharmacy";
          break;
        case "conditions":
          query = "diagnosis condition disease illness symptoms diagnosed";
          break;
        case "procedures":
          query = "procedure surgery operation test examination performed";
          break;
        case "allergies":
          query = "allergy allergic reaction adverse effects contraindication";
          break;
        case "timeline":
          query = "chronological timeline history progression events dates";
          break;
      }

      // Search for relevant documents
      const queryEmbedding = await this.generateQueryEmbedding(query);
      const searchResults = await contextStats.database.search(queryEmbedding, {
        limit: 15,
        threshold: 0.5,
        includeMetadata: true,
      });

      // Filter by timeframe if specified
      let filteredResults = searchResults;
      if (params.timeframe) {
        filteredResults = searchResults.filter((result) => {
          const docDate = new Date(result.metadata.date);
          const start = params.timeframe.start
            ? new Date(params.timeframe.start)
            : null;
          const end = params.timeframe.end
            ? new Date(params.timeframe.end)
            : null;
          return (!start || docDate >= start) && (!end || docDate <= end);
        });
      }

      // Extract relevant information based on query type
      const extractedData = await this.extractMedicalData(
        filteredResults,
        params.queryType,
      );

      const historyData = {
        queryType: params.queryType,
        timeframe: params.timeframe,
        totalDocuments: filteredResults.length,
        extractedData,
        documents: filteredResults.slice(0, 10).map((result) => ({
          id: result.documentId,
          title: result.metadata.title,
          date: result.metadata.date,
          relevance: result.similarity,
          excerpt:
            result.excerpt ||
            result.metadata.summary?.substring(0, 150) + "...",
        })),
      };

      const timeframeText = params.timeframe
        ? ` (${params.timeframe.start || "start"} to ${params.timeframe.end || "present"})`
        : "";

      const summaryText =
        `Medical history query for ${params.queryType}${timeframeText}:\n\n` +
        `Found ${filteredResults.length} relevant documents with ${extractedData.length} extracted ${params.queryType} entries.\n\n` +
        extractedData
          .slice(0, 5)
          .map(
            (item) =>
              `• ${item.date || "Unknown date"}: ${this.formatExtractedItem(item, params.queryType)}`,
          )
          .join("\n");

      return {
        content: [
          {
            type: "text",
            text: summaryText,
          },
          {
            type: "resource",
            resource: historyData,
          },
        ],
      };
    } catch (error) {
      logger.namespace("Context")?.error("Failed to query medical history", {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
        queryType: params.queryType,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: Medical history query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    return query;
  }

  /**
   * Extract medical data from search results based on query type
   */
  private async extractMedicalData(
    searchResults: any[],
    queryType: string,
  ): Promise<any[]> {
    // This is a simplified extraction - in real implementation,
    // this would use more sophisticated NLP/extraction logic
    const extractedData: any[] = [];

    for (const result of searchResults) {
      const content = result.excerpt || result.metadata.summary || "";
      const date = result.metadata.date;

      switch (queryType) {
        case "medications":
          // Extract medication mentions
          if (
            content.toLowerCase().includes("medication") ||
            content.toLowerCase().includes("prescription")
          ) {
            extractedData.push({
              date,
              content: content.substring(0, 200),
              documentId: result.documentId,
              type: "medication",
            });
          }
          break;

        case "conditions":
          // Extract condition mentions
          if (
            content.toLowerCase().includes("diagnosis") ||
            content.toLowerCase().includes("condition")
          ) {
            extractedData.push({
              date,
              content: content.substring(0, 200),
              documentId: result.documentId,
              type: "condition",
            });
          }
          break;

        case "procedures":
          // Extract procedure mentions
          if (
            content.toLowerCase().includes("procedure") ||
            content.toLowerCase().includes("surgery")
          ) {
            extractedData.push({
              date,
              content: content.substring(0, 200),
              documentId: result.documentId,
              type: "procedure",
            });
          }
          break;

        case "allergies":
          // Extract allergy mentions
          if (content.toLowerCase().includes("allerg")) {
            extractedData.push({
              date,
              content: content.substring(0, 200),
              documentId: result.documentId,
              type: "allergy",
            });
          }
          break;

        case "timeline":
          // All documents contribute to timeline
          extractedData.push({
            date,
            title: result.metadata.title || "Medical Event",
            content: content.substring(0, 200),
            documentId: result.documentId,
            type: "timeline_event",
          });
          break;
      }
    }

    // Sort by date (newest first)
    return extractedData.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });
  }

  /**
   * Format extracted item for display
   */
  private formatExtractedItem(item: any, queryType: string): string {
    if (item.content) {
      return item.content.substring(0, 100) + "...";
    }
    return `${queryType} information found`;
  }
}
