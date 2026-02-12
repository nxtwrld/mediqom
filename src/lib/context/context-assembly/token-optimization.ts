/**
 * Token Optimization Utilities
 *
 * Provides utilities for estimating and optimizing token usage
 * in context assembly to stay within model limits.
 */

import type { KeyPoint } from "../types";

export class TokenOptimizer {
  /**
   * Estimate token count from text (rough approximation)
   * OpenAI uses ~4 characters per token as a rough estimate
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;

    // More accurate estimation considering:
    // - Average word length in medical text
    // - Punctuation and special characters
    // - JSON structure overhead
    const chars = text.length;
    const words = text.split(/\s+/).length;

    // Medical text tends to have longer words
    const avgCharsPerToken = 3.8;

    return Math.ceil(chars / avgCharsPerToken);
  }

  /**
   * Truncate text to fit within token budget
   */
  static truncateToTokens(text: string, maxTokens: number): string {
    if (!text) return "";

    const estimatedTokens = this.estimateTokens(text);
    if (estimatedTokens <= maxTokens) {
      return text;
    }

    // Calculate approximate character limit
    const maxChars = Math.floor(maxTokens * 3.8);

    // Try to truncate at sentence boundaries
    if (maxChars < text.length) {
      const truncated = text.substring(0, maxChars);
      const lastSentence = truncated.lastIndexOf(".");
      const lastNewline = truncated.lastIndexOf("\n");

      // Use sentence boundary if reasonable
      if (lastSentence > maxChars * 0.8) {
        return truncated.substring(0, lastSentence + 1);
      }

      // Use newline boundary if reasonable
      if (lastNewline > maxChars * 0.8) {
        return truncated.substring(0, lastNewline);
      }

      // Otherwise just truncate with ellipsis
      return truncated + "...";
    }

    return text;
  }

  /**
   * Optimize array of text items to fit within token budget
   */
  static optimizeTextArray(
    items: string[],
    maxTokens: number,
    priorityFunction?: (item: string, index: number) => number,
  ): string[] {
    if (!items.length) return [];

    // Calculate initial token usage
    const itemTokens = items.map((item) => this.estimateTokens(item));
    const totalTokens = itemTokens.reduce((sum, tokens) => sum + tokens, 0);

    if (totalTokens <= maxTokens) {
      return items;
    }

    // Sort by priority if function provided
    let indexedItems = items.map((item, index) => ({
      item,
      index,
      tokens: itemTokens[index],
    }));

    if (priorityFunction) {
      indexedItems.sort((a, b) => {
        const priorityA = priorityFunction(a.item, a.index);
        const priorityB = priorityFunction(b.item, b.index);
        return priorityB - priorityA; // Higher priority first
      });
    }

    // Select items that fit within budget
    const optimized: string[] = [];
    let usedTokens = 0;

    for (const { item, tokens } of indexedItems) {
      if (usedTokens + tokens <= maxTokens) {
        optimized.push(item);
        usedTokens += tokens;
      } else {
        // Try to truncate the item to fit remaining budget
        const remainingTokens = maxTokens - usedTokens;
        if (remainingTokens > 50) {
          // Only if meaningful space left
          const truncated = this.truncateToTokens(item, remainingTokens);
          if (truncated.length > 20) {
            // Only if meaningful content remains
            optimized.push(truncated);
          }
        }
        break;
      }
    }

    return optimized;
  }

  /**
   * Optimize key points to fit within token budget
   */
  static optimizeKeyPoints(
    keyPoints: KeyPoint[],
    maxTokens: number,
  ): KeyPoint[] {
    if (!keyPoints.length) return [];

    // Sort by confidence (higher first)
    const sortedPoints = [...keyPoints].sort(
      (a, b) => b.confidence - a.confidence,
    );

    const optimized: typeof keyPoints = [];
    let usedTokens = 0;

    for (const point of sortedPoints) {
      const pointText = `${point.type}: ${point.text}`;
      const pointTokens = this.estimateTokens(pointText);

      if (usedTokens + pointTokens <= maxTokens) {
        optimized.push(point);
        usedTokens += pointTokens;
      } else {
        // Try to truncate the point text
        const remainingTokens = maxTokens - usedTokens;
        if (remainingTokens > 20) {
          const truncatedText = this.truncateToTokens(
            point.text,
            remainingTokens - 10,
          ); // Reserve tokens for type prefix
          if (truncatedText.length > 10) {
            optimized.push({
              ...point,
              text: truncatedText,
            });
          }
        }
        break;
      }
    }

    return optimized;
  }

  /**
   * Create a summary that fits within token budget
   */
  static createOptimizedSummary(
    sections: { [key: string]: string },
    maxTokens: number,
    sectionPriorities: { [key: string]: number } = {},
  ): string {
    if (!sections || Object.keys(sections).length === 0) {
      return "";
    }

    // Calculate tokens for each section
    const sectionData = Object.entries(sections).map(([key, content]) => ({
      key,
      content,
      tokens: this.estimateTokens(content),
      priority: sectionPriorities[key] || 1,
    }));

    // Sort by priority (higher first)
    sectionData.sort((a, b) => b.priority - a.priority);

    const includedSections: string[] = [];
    let usedTokens = 0;

    for (const section of sectionData) {
      if (!section.content.trim()) continue;

      // Add section header tokens (approximate)
      const headerTokens = this.estimateTokens(`${section.key}:\n`);
      const totalSectionTokens = section.tokens + headerTokens;

      if (usedTokens + totalSectionTokens <= maxTokens) {
        includedSections.push(`${section.key}:\n${section.content}`);
        usedTokens += totalSectionTokens;
      } else {
        // Try to truncate section to fit
        const remainingTokens = maxTokens - usedTokens - headerTokens;
        if (remainingTokens > 50) {
          const truncatedContent = this.truncateToTokens(
            section.content,
            remainingTokens,
          );
          if (truncatedContent.length > 20) {
            includedSections.push(`${section.key}:\n${truncatedContent}`);
          }
        }
        break;
      }
    }

    return includedSections.join("\n\n");
  }

  /**
   * Calculate token distribution for context sections
   */
  static calculateTokenDistribution(
    totalTokens: number,
    sections: string[],
  ): { [section: string]: number } {
    const distribution: { [section: string]: number } = {};
    const sectionCount = sections.length;

    if (sectionCount === 0) return distribution;

    // Default distribution weights
    const defaultWeights: { [key: string]: number } = {
      summary: 0.25,
      keyPoints: 0.35,
      documents: 0.3,
      medicalContext: 0.1,
    };

    // Calculate tokens for each section
    let totalWeight = 0;
    for (const section of sections) {
      const weight = defaultWeights[section] || 1 / sectionCount;
      distribution[section] = Math.floor(totalTokens * weight);
      totalWeight += weight;
    }

    // Adjust for any remaining tokens due to rounding
    const usedTokens = Object.values(distribution).reduce(
      (sum, tokens) => sum + tokens,
      0,
    );
    const remainingTokens = totalTokens - usedTokens;

    if (remainingTokens > 0) {
      // Give remaining tokens to the first section
      const firstSection = sections[0];
      if (firstSection) {
        distribution[firstSection] += remainingTokens;
      }
    }

    return distribution;
  }
}
