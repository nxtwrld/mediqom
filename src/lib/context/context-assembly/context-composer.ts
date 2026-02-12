/**
 * Context Composer
 *
 * Assembles relevant context from search results for AI interactions.
 * Extracts key points, optimizes for token limits, and provides medical insights.
 */

import type {
  ContextMatch,
  AssembledContext,
  KeyPoint,
  ContextDocument,
  MedicalContext,
} from "../types";
import { TokenOptimizer } from "./token-optimization";
import { logger } from "$lib/logging/logger";

export class ContextAssembler {
  /**
   * Assemble context for AI from search matches
   */
  async assembleContextForAI(
    matches: ContextMatch[],
    query: string,
    options: {
      maxTokens?: number;
      includeMetadata?: boolean;
      includeMedicalContext?: boolean;
      priorityTypes?: string[];
    } = {},
  ): Promise<AssembledContext> {
    const maxTokens = options.maxTokens || 4000;

    try {
      // 1. Extract key points from top matches
      const keyPoints = await this.extractKeyPoints(matches.slice(0, 10));

      // 2. Create prioritized context sections
      const contextSections = await this.buildContextSections(
        matches,
        query,
        options,
      );

      // 3. Build medical context if requested
      const medicalContext = options.includeMedicalContext
        ? await this.buildMedicalContext(matches)
        : undefined;

      // 4. Optimize context within token limits
      const optimizedContext = await this.optimizeContextTokens(
        contextSections,
        keyPoints,
        medicalContext,
        maxTokens,
      );

      // 5. Calculate overall confidence
      const confidence = this.calculateContextConfidence(matches);

      return {
        summary: optimizedContext.summary,
        keyPoints: optimizedContext.keyPoints,
        relevantDocuments: optimizedContext.documents,
        medicalContext: optimizedContext.medicalContext,
        confidence,
        tokenCount: optimizedContext.tokenCount,
      };
    } catch (error) {
      logger.namespace("Context").error("Failed to assemble context", { error });

      // Return minimal context on error
      return {
        summary: "Context assembly failed. Limited information available.",
        keyPoints: [],
        relevantDocuments: [],
        confidence: 0,
        tokenCount: 0,
      };
    }
  }

  /**
   * Extract key medical and clinical insights from matches
   */
  private async extractKeyPoints(matches: ContextMatch[]): Promise<KeyPoint[]> {
    const keyPoints: KeyPoint[] = [];

    for (const match of matches) {
      const { metadata, similarity, excerpt } = match;

      // Extract different types of key points based on content analysis
      const points = this.analyzeContentForKeyPoints(
        metadata.summary,
        excerpt || "",
        metadata,
        similarity,
      );

      keyPoints.push(...points);
    }

    // Sort by confidence and relevance
    keyPoints.sort((a, b) => b.confidence - a.confidence);

    // Limit to top key points
    return keyPoints.slice(0, 15);
  }

  /**
   * Analyze content to extract structured key points
   */
  private analyzeContentForKeyPoints(
    summary: string,
    excerpt: string,
    metadata: any,
    similarity: number,
  ): KeyPoint[] {
    const points: KeyPoint[] = [];
    const text = `${summary} ${excerpt}`.toLowerCase();

    // Medical findings patterns
    const findingPatterns = [
      /(?:diagnosis|diagnosed|condition).*?([^.]+)/gi,
      /(?:finding|findings).*?([^.]+)/gi,
      /(?:shows?|reveals?|indicates?).*?([^.]+)/gi,
    ];

    findingPatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.slice(0, 2).forEach((match) => {
          points.push({
            text: match.trim(),
            type: "finding",
            date: metadata.date,
            confidence: similarity * 0.9,
            sourceDocumentId: metadata.documentId,
          });
        });
      }
    });

    // Medication patterns
    const medicationPatterns = [
      /(?:prescribed|medication|drug|treatment).*?([^.]+)/gi,
      /(?:taking|started|stopped|increased|decreased).*?(?:mg|mcg|units).*?([^.]+)/gi,
    ];

    medicationPatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.slice(0, 2).forEach((match) => {
          points.push({
            text: match.trim(),
            type: "medication",
            date: metadata.date,
            confidence: similarity * 0.85,
            sourceDocumentId: metadata.documentId,
          });
        });
      }
    });

    // Procedure patterns
    const procedurePatterns = [
      /(?:procedure|surgery|operation|test|examination).*?([^.]+)/gi,
      /(?:performed|completed|scheduled).*?(?:procedure|surgery|test).*?([^.]+)/gi,
    ];

    procedurePatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.slice(0, 1).forEach((match) => {
          points.push({
            text: match.trim(),
            type: "procedure",
            date: metadata.date,
            confidence: similarity * 0.8,
            sourceDocumentId: metadata.documentId,
          });
        });
      }
    });

    // Risk factors
    const riskPatterns = [
      /(?:risk|family history|genetic).*?([^.]+)/gi,
      /(?:smoking|diabetes|hypertension|obesity).*?([^.]+)/gi,
    ];

    riskPatterns.forEach((pattern) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.slice(0, 1).forEach((match) => {
          points.push({
            text: match.trim(),
            type: "risk",
            date: metadata.date,
            confidence: similarity * 0.7,
            sourceDocumentId: metadata.documentId,
          });
        });
      }
    });

    return points;
  }

  /**
   * Build structured context sections
   */
  private async buildContextSections(
    matches: ContextMatch[],
    query: string,
    options: any,
  ) {
    const sections = {
      patientSummary: this.buildPatientSummary(matches),
      relevantHistory: this.buildRelevantHistory(matches, query),
      recentChanges: this.buildRecentChanges(matches),
      keyDocuments: this.buildKeyDocuments(matches, options.priorityTypes),
    };

    return sections;
  }

  /**
   * Build patient summary from matches
   */
  private buildPatientSummary(matches: ContextMatch[]): string {
    if (matches.length === 0) return "";

    const recentMatches = matches
      .filter((m) => this.isRecentDocument(m.metadata.date, 90)) // Last 90 days
      .slice(0, 3);

    const summaryParts = recentMatches.map(
      (match) =>
        `[${match.metadata.date}] ${match.metadata.summary.substring(0, 100)}...`,
    );

    return summaryParts.join("\n");
  }

  /**
   * Build relevant history section
   */
  private buildRelevantHistory(matches: ContextMatch[], query: string): string {
    const historicalMatches = matches
      .filter((m) => !this.isRecentDocument(m.metadata.date, 90))
      .slice(0, 5);

    const historyParts = historicalMatches.map(
      (match) =>
        `[${match.metadata.date}] ${match.excerpt || match.metadata.summary.substring(0, 150)}...`,
    );

    return historyParts.join("\n");
  }

  /**
   * Build recent changes section
   */
  private buildRecentChanges(matches: ContextMatch[]): string {
    const recentMatches = matches
      .filter((m) => this.isRecentDocument(m.metadata.date, 30)) // Last 30 days
      .sort(
        (a, b) =>
          new Date(b.metadata.date).getTime() -
          new Date(a.metadata.date).getTime(),
      )
      .slice(0, 3);

    const changesParts = recentMatches.map(
      (match) =>
        `[${match.metadata.date}] ${match.metadata.documentType}: ${match.metadata.summary.substring(0, 100)}...`,
    );

    return changesParts.join("\n");
  }

  /**
   * Build key documents section
   */
  private buildKeyDocuments(
    matches: ContextMatch[],
    priorityTypes?: string[],
  ): ContextDocument[] {
    let relevantMatches = matches.slice(0, 8);

    // Prioritize certain document types if specified
    if (priorityTypes && priorityTypes.length > 0) {
      const priorityMatches = matches.filter((m) =>
        priorityTypes.includes(m.metadata.documentType),
      );
      const otherMatches = matches.filter(
        (m) => !priorityTypes.includes(m.metadata.documentType),
      );

      relevantMatches = [
        ...priorityMatches.slice(0, 5),
        ...otherMatches.slice(0, 3),
      ];
    }

    return relevantMatches.map((match) => ({
      documentId: match.documentId,
      type: match.metadata.documentType,
      date: match.metadata.date,
      excerpt:
        match.excerpt || match.metadata.summary.substring(0, 200) + "...",
      relevance: match.relevanceScore,
    }));
  }

  /**
   * Build medical context with clinical insights
   */
  private async buildMedicalContext(
    matches: ContextMatch[],
  ): Promise<MedicalContext> {
    // This would integrate with the Clinical Data Platform (CDP)
    // to provide structured medical context

    return {
      // Timeline of medical events
      timeline: {
        events: [],
        timeRange: { start: "", end: "" },
        significantEvents: [],
      },

      // Recent changes in health status
      recentChanges: matches
        .filter((m) => this.isRecentDocument(m.metadata.date, 60))
        .map((m) => ({
          date: m.metadata.date,
          type: m.metadata.documentType,
          description: m.metadata.summary.substring(0, 100),
          impact: "neutral" as const,
        }))
        .slice(0, 5),
    };
  }

  /**
   * Optimize context within token limits using TokenOptimizer
   */
  private async optimizeContextTokens(
    sections: any,
    keyPoints: KeyPoint[],
    medicalContext: MedicalContext | undefined,
    maxTokens: number,
  ) {
    const optimized = {
      summary: "",
      keyPoints: [] as KeyPoint[],
      documents: [] as ContextDocument[],
      medicalContext: undefined as MedicalContext | undefined,
      tokenCount: 0,
    };

    // Calculate token distribution
    const sectionNames = [
      "summary",
      "keyPoints",
      "documents",
      "medicalContext",
    ];
    const tokenDistribution = TokenOptimizer.calculateTokenDistribution(
      maxTokens,
      sectionNames,
    );

    // 1. Optimize summary
    const summaryBudget = tokenDistribution.summary;
    optimized.summary = TokenOptimizer.createOptimizedSummary(
      {
        "Recent Activity": sections.patientSummary,
        "Recent Changes": sections.recentChanges,
        "Historical Context": sections.relevantHistory,
      },
      summaryBudget,
      { "Recent Changes": 3, "Recent Activity": 2, "Historical Context": 1 },
    );

    // 2. Optimize key points
    const keyPointsBudget = tokenDistribution.keyPoints;
    optimized.keyPoints = TokenOptimizer.optimizeKeyPoints(
      keyPoints,
      keyPointsBudget,
    );

    // 3. Optimize documents
    const documentsBudget = tokenDistribution.documents;
    const documentExcerpts = sections.keyDocuments.map(
      (d: ContextDocument) => d.excerpt,
    );
    const optimizedExcerpts = TokenOptimizer.optimizeTextArray(
      documentExcerpts,
      documentsBudget,
      (excerpt, index) => sections.keyDocuments[index]?.relevance || 0,
    );

    optimized.documents = sections.keyDocuments
      .slice(0, optimizedExcerpts.length)
      .map((doc: ContextDocument, index: number) => ({
        ...doc,
        excerpt: optimizedExcerpts[index] || doc.excerpt,
      }));

    // 4. Include medical context if available and space permits
    if (medicalContext) {
      const medicalBudget = tokenDistribution.medicalContext;
      const medicalText = JSON.stringify(medicalContext);

      if (TokenOptimizer.estimateTokens(medicalText) <= medicalBudget) {
        optimized.medicalContext = medicalContext;
      }
    }

    // Calculate final token count
    const summaryTokens = TokenOptimizer.estimateTokens(optimized.summary);
    const keyPointsTokens = optimized.keyPoints.reduce(
      (sum, point) =>
        sum + TokenOptimizer.estimateTokens(`${point.type}: ${point.text}`),
      0,
    );
    const documentsTokens = optimized.documents.reduce(
      (sum, doc) => sum + TokenOptimizer.estimateTokens(doc.excerpt),
      0,
    );
    const medicalTokens = optimized.medicalContext
      ? TokenOptimizer.estimateTokens(JSON.stringify(optimized.medicalContext))
      : 0;

    optimized.tokenCount =
      summaryTokens + keyPointsTokens + documentsTokens + medicalTokens;

    return optimized;
  }

  /**
   * Build optimized summary from sections
   */
  private buildOptimizedSummary(sections: any): string {
    const parts = [];

    if (sections.patientSummary) {
      parts.push(`Recent activity:\n${sections.patientSummary}`);
    }

    if (sections.recentChanges) {
      parts.push(`Recent changes:\n${sections.recentChanges}`);
    }

    if (sections.relevantHistory) {
      parts.push(`Historical context:\n${sections.relevantHistory}`);
    }

    return parts.join("\n\n");
  }

  /**
   * Calculate overall confidence in context assembly
   */
  private calculateContextConfidence(matches: ContextMatch[]): number {
    if (matches.length === 0) return 0;

    // Base confidence on match quality and quantity
    const avgSimilarity =
      matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length;
    const quantityFactor = Math.min(matches.length / 5, 1); // Optimal around 5 matches
    const recentnessFactor =
      matches.filter((m) => this.isRecentDocument(m.metadata.date, 180))
        .length / matches.length;

    return avgSimilarity * 0.5 + quantityFactor * 0.3 + recentnessFactor * 0.2;
  }

  /**
   * Check if document is recent
   */
  private isRecentDocument(dateStr: string, daysThreshold: number): boolean {
    const docDate = new Date(dateStr);
    const now = new Date();
    const daysDiff =
      (now.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= daysThreshold;
  }
}

// Export singleton instance
export const contextAssembler = new ContextAssembler();
