/**
 * Session Context Integration
 *
 * Integrates context assembly with the session management system to provide
 * intelligent medical history context for real-time medical consultations.
 */

import { profileContextManager } from "./profile-context";
import { chatContextService } from "./chat-service";
import { contextAssembler } from "../context-assembly/context-composer";
// Note: Embedding operations now handled by server-side services
import type { SessionData, Message } from "$lib/session/manager";
import type { ChatContextResult } from "./chat-service";
import { logger } from "$lib/logging/logger";

export interface SessionContextOptions {
  profileId: string;
  includeRecentTranscripts?: boolean;
  maxContextTokens?: number;
  contextThreshold?: number;
  priorityTypes?: string[];
}

export interface SessionContextResult {
  assembledContext?: any;
  availableTools: string[];
  contextSummary: string;
  documentCount: number;
  confidence: number;
  tokenUsage: number;
  relevantHistory: string[];
}

export class SessionContextService {
  private sessionContextCache = new Map<
    string,
    {
      result: SessionContextResult;
      lastUpdate: number;
      transcriptCount: number;
    }
  >();

  /**
   * Initialize context for a new medical session
   */
  async initializeSessionContext(
    sessionId: string,
    sessionData: SessionData,
    options: SessionContextOptions,
  ): Promise<SessionContextResult> {
    try {
      const startTime = performance.now();

      // Check if profile has available context
      const contextStats = profileContextManager.getContextStats(
        options.profileId,
      );
      if (!contextStats) {
        logger
          .namespace("SessionContext")
          .warn("No context available for session", {
            sessionId,
            profileId: options.profileId,
          });
        return this.createEmptySessionContextResult();
      }

      // Build initial context query from user info and session setup
      const contextQuery = this.buildSessionContextQuery(sessionData, options);

      // Generate embedding for the session context
      const sessionEmbedding = await this.generateQueryEmbedding(contextQuery);

      // Search for relevant medical context
      const searchResults = await contextStats.database.search(
        sessionEmbedding,
        {
          limit: 15,
          threshold: options.contextThreshold || 0.6,
          includeMetadata: true,
        },
      );

      // Filter by priority types if specified
      let filteredResults = searchResults;
      if (options.priorityTypes && options.priorityTypes.length > 0) {
        filteredResults = searchResults.filter((result: any) =>
          options.priorityTypes!.some(
            (type) =>
              result.metadata.documentType === type ||
              result.metadata.category === type,
          ),
        );
      }

      let assembledContext;
      let contextSummary =
        "No relevant medical history found for this session.";
      let tokenUsage = 0;

      if (filteredResults.length > 0) {
        // Assemble context optimized for real-time medical consultation
        assembledContext = await contextAssembler.assembleContextForAI(
          filteredResults,
          contextQuery,
          {
            maxTokens: options.maxContextTokens || 2000, // Smaller for real-time
            includeMetadata: true,
            includeMedicalContext: true,
            priorityTypes: options.priorityTypes,
          },
        );

        contextSummary = this.generateSessionContextSummary(
          assembledContext,
          sessionData,
        );
        tokenUsage = assembledContext.tokenCount;
      }

      // Extract relevant history for quick reference
      const relevantHistory = this.extractRelevantHistory(filteredResults);

      const result: SessionContextResult = {
        assembledContext,
        availableTools: this.getSessionTools(),
        contextSummary,
        documentCount: filteredResults.length,
        confidence: assembledContext?.confidence || 0,
        tokenUsage,
        relevantHistory,
      };

      // Cache the result
      this.sessionContextCache.set(sessionId, {
        result,
        lastUpdate: Date.now(),
        transcriptCount: sessionData.transcripts?.length || 0,
      });

      const processingTime = performance.now() - startTime;

      logger.namespace("SessionContext").info("Session context initialized", {
        sessionId,
        profileId: options.profileId,
        documentsFound: filteredResults.length,
        tokenUsage,
        processingTimeMs: processingTime.toFixed(2),
        contextAvailable: !!assembledContext,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger
        .namespace("SessionContext")
        .error("Failed to initialize session context", {
          error: errorMessage,
          sessionId,
          profileId: options.profileId,
        });
      return this.createEmptySessionContextResult();
    }
  }

  /**
   * Update context during session as new transcripts are added
   */
  async updateSessionContext(
    sessionId: string,
    sessionData: SessionData,
    newTranscripts: string[],
    options: SessionContextOptions,
  ): Promise<SessionContextResult> {
    try {
      // Check if we need to update (significant new content)
      const cached = this.sessionContextCache.get(sessionId);
      const currentTranscriptCount = sessionData.transcripts?.length || 0;

      if (
        cached &&
        currentTranscriptCount - cached.transcriptCount < 3 && // Less than 3 new transcripts
        Date.now() - cached.lastUpdate < 30000
      ) {
        // Less than 30 seconds ago
        return cached.result;
      }

      // Build context query from recent conversation
      const recentConversation = this.buildConversationContext(
        sessionData,
        newTranscripts,
      );
      const contextQuery = `${this.buildSessionContextQuery(sessionData, options)}\n\nCurrent conversation:\n${recentConversation}`;

      // Use chat context service for conversation-based context update
      const chatResult = await chatContextService.prepareContextForChat(
        contextQuery,
        {
          profileId: options.profileId,
          maxTokens: options.maxContextTokens || 2000,
          includeDocuments: true,
          contextThreshold: options.contextThreshold || 0.7,
        },
      );

      // Convert to session context result
      const result: SessionContextResult = {
        assembledContext: chatResult.assembledContext,
        availableTools: this.getSessionTools(),
        contextSummary: chatResult.contextSummary,
        documentCount: chatResult.documentCount,
        confidence: chatResult.confidence,
        tokenUsage: chatResult.tokenUsage,
        relevantHistory: this.extractRelevantHistoryFromContext(
          chatResult.assembledContext,
        ),
      };

      // Update cache
      this.sessionContextCache.set(sessionId, {
        result,
        lastUpdate: Date.now(),
        transcriptCount: currentTranscriptCount,
      });

      logger.namespace("SessionContext").debug("Session context updated", {
        sessionId,
        newTranscripts: newTranscripts.length,
        documentCount: result.documentCount,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger
        .namespace("SessionContext")
        .error("Failed to update session context", {
          error: errorMessage,
          sessionId,
        });

      // Return cached result if available, otherwise empty
      const cached = this.sessionContextCache.get(sessionId);
      return cached?.result || this.createEmptySessionContextResult();
    }
  }

  /**
   * Get context for session analysis
   */
  async getContextForAnalysis(
    sessionId: string,
    analysisType: "diagnosis" | "treatment" | "medication" | "followup",
    sessionData: SessionData,
  ): Promise<{
    medicalHistory: any[];
    relevantDocuments: any[];
    contextSummary: string;
  }> {
    try {
      const cached = this.sessionContextCache.get(sessionId);
      if (!cached) {
        return {
          medicalHistory: [],
          relevantDocuments: [],
          contextSummary: "No context available for analysis",
        };
      }

      const context = cached.result.assembledContext;
      if (!context) {
        return {
          medicalHistory: [],
          relevantDocuments: [],
          contextSummary: "No medical context assembled for this session",
        };
      }

      // Filter context based on analysis type
      const relevantHistory = this.filterContextByAnalysisType(
        context,
        analysisType,
      );

      return {
        medicalHistory: relevantHistory,
        relevantDocuments: context.relevantDocuments || [],
        contextSummary: `Context for ${analysisType} analysis: ${relevantHistory.length} relevant medical history items found`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger
        .namespace("SessionContext")
        .error("Failed to get context for analysis", {
          error: errorMessage,
          sessionId,
          analysisType,
        });

      return {
        medicalHistory: [],
        relevantDocuments: [],
        contextSummary: "Error retrieving context for analysis",
      };
    }
  }

  /**
   * Clear session context cache
   */
  clearSessionContext(sessionId: string): void {
    this.sessionContextCache.delete(sessionId);
    logger
      .namespace("SessionContext")
      .debug("Session context cleared", { sessionId });
  }

  /**
   * Build initial context query for session
   */
  private buildSessionContextQuery(
    sessionData: SessionData,
    options: SessionContextOptions,
  ): string {
    const parts = [
      "Medical consultation session context",
      `User ID: ${sessionData.userId}`,
      `Language: ${sessionData.language}`,
      `Session started: ${sessionData.startTime}`,
    ];

    if (options.priorityTypes && options.priorityTypes.length > 0) {
      parts.push(`Focus areas: ${options.priorityTypes.join(", ")}`);
    }

    return parts.join("\n");
  }

  /**
   * Build conversation context from recent transcripts
   */
  private buildConversationContext(
    sessionData: SessionData,
    newTranscripts: string[],
  ): string {
    const recentMessages = [
      ...(sessionData.conversationHistory?.slice(-5) || []), // Last 5 messages
      ...newTranscripts.map((text) => ({
        content: text,
        role: "user" as const,
      })),
    ];

    return recentMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");
  }

  /**
   * Generate session-specific context summary
   */
  private generateSessionContextSummary(
    context: any,
    sessionData: SessionData,
  ): string {
    const parts = [];

    if (context.keyPoints?.length) {
      const medicalPoints = context.keyPoints.filter((p: any) =>
        ["diagnosis", "medication", "treatment", "procedure"].includes(p.type),
      );
      if (medicalPoints.length > 0) {
        parts.push(`${medicalPoints.length} relevant medical history points`);
      }
    }

    if (context.medicalContext?.recentChanges?.length) {
      parts.push(
        `${context.medicalContext.recentChanges.length} recent medical changes`,
      );
    }

    if (context.relevantDocuments?.length) {
      parts.push(
        `${context.relevantDocuments.length} relevant medical documents`,
      );
    }

    return parts.length > 0
      ? `Session context assembled: ${parts.join(", ")}`
      : "Basic medical context available for consultation";
  }

  /**
   * Extract relevant history for quick reference
   */
  private extractRelevantHistory(searchResults: any[]): string[] {
    return searchResults
      .slice(0, 5) // Top 5 most relevant
      .map((result) => {
        const date = result.metadata.date
          ? new Date(result.metadata.date).toLocaleDateString()
          : "Unknown date";
        const title = result.metadata.title || "Medical record";
        const summary = result.excerpt || result.metadata.summary || "";
        return `${date}: ${title} - ${summary.substring(0, 100)}...`;
      });
  }

  /**
   * Extract relevant history from assembled context
   */
  private extractRelevantHistoryFromContext(context: any): string[] {
    if (!context?.keyPoints) return [];

    return context.keyPoints
      .slice(0, 5)
      .map((point: any) => `${point.date || "Unknown date"}: ${point.text}`);
  }

  /**
   * Filter context by analysis type
   */
  private filterContextByAnalysisType(
    context: any,
    analysisType: string,
  ): any[] {
    if (!context?.keyPoints) return [];

    const typeMapping: Record<string, string[]> = {
      diagnosis: ["diagnosis", "condition", "symptom"],
      treatment: ["treatment", "procedure", "therapy"],
      medication: ["medication", "prescription", "drug"],
      followup: ["followup", "appointment", "referral"],
    };

    const relevantTypes = typeMapping[analysisType] || [];

    return context.keyPoints.filter(
      (point: any) =>
        relevantTypes.includes(point.type) ||
        relevantTypes.some((type) => point.text.toLowerCase().includes(type)),
    );
  }

  /**
   * Get available tools for session
   */
  private getSessionTools(): string[] {
    return [
      "searchDocuments",
      "getAssembledContext",
      "getProfileData",
      "queryMedicalHistory",
      "getDocumentById",
    ];
  }

  /**
   * Create empty session context result
   */
  private createEmptySessionContextResult(): SessionContextResult {
    return {
      availableTools: this.getSessionTools(),
      contextSummary:
        "No medical context available. Consider loading patient documents first.",
      documentCount: 0,
      confidence: 0,
      tokenUsage: 0,
      relevantHistory: [],
    };
  }

  /**
   * Generate embedding for search query using server-side API
   */
  private async generateQueryEmbedding(query: string): Promise<Float32Array> {
    try {
      const response = await fetch("/v1/embeddings/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Query embedding API error: ${errorData.message || response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.success || !data.data.embedding) {
        throw new Error("Invalid response from query embedding API");
      }

      // Convert array back to Float32Array
      return new Float32Array(data.data.embedding);
    } catch (error) {
      logger
        .namespace("SessionContext")
        .error("Failed to generate query embedding", {
          error: error instanceof Error ? error.message : String(error),
        });
      throw error;
    }
  }
}

// Export singleton instance
export const sessionContextService = new SessionContextService();
