import { logger } from "$lib/logging/logger";

/**
 * Audio chunk metadata for overlap processing
 */
export interface AudioChunkMetadata {
  sequenceNumber: number;
  timestamp: number;
  isTimeoutForced: boolean;
  overlapDurationMs: number;
  energyLevel: number;
}

/**
 * Transcription segment with metadata
 */
export interface TranscriptionSegment {
  text: string;
  confidence: number;
  timestamp: number;
  chunkMetadata: AudioChunkMetadata;
  processed: boolean;
}

/**
 * Overlap detection result
 */
export interface OverlapDetection {
  segments: [TranscriptionSegment, TranscriptionSegment];
  similarity: number;
  overlapStart: number;
  overlapEnd: number;
  confidence: number;
  mergeRecommended: boolean;
}

/**
 * Merged transcription result
 */
export interface MergedTranscription {
  text: string;
  confidence: number;
  segments: TranscriptionSegment[];
  overlapDetections: OverlapDetection[];
  processingMetadata: {
    totalSegments: number;
    mergedSegments: number;
    duplicatesRemoved: number;
    averageConfidence: number;
  };
}

/**
 * Text similarity algorithms for overlap detection
 */
export class TextSimilarity {
  /**
   * Calculate Levenshtein distance between two strings
   */
  static levenshteinDistance(a: string, b: string): number {
    const matrix = Array(a.length + 1)
      .fill(null)
      .map(() => Array(b.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) {
      matrix[i][0] = i;
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost, // substitution
        );
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Calculate similarity score (0-1) using Levenshtein distance
   */
  static similarityScore(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(a, b);
    return (maxLen - distance) / maxLen;
  }

  /**
   * Find longest common substring
   */
  static longestCommonSubstring(
    a: string,
    b: string,
  ): {
    substring: string;
    startA: number;
    startB: number;
    length: number;
  } {
    const matrix = Array(a.length + 1)
      .fill(null)
      .map(() => Array(b.length + 1).fill(0));

    let maxLength = 0;
    let endPosA = 0;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1] + 1;
          if (matrix[i][j] > maxLength) {
            maxLength = matrix[i][j];
            endPosA = i;
          }
        }
      }
    }

    const startA = endPosA - maxLength;
    const substring = a.substring(startA, endPosA);
    const startB = b.indexOf(substring);

    return {
      substring,
      startA,
      startB,
      length: maxLength,
    };
  }

  /**
   * Calculate word-based similarity for better semantic understanding
   */
  static wordSimilarity(a: string, b: string): number {
    const wordsA = this.normalizeText(a)
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const wordsB = this.normalizeText(b)
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (wordsA.length === 0 && wordsB.length === 0) return 1;
    if (wordsA.length === 0 || wordsB.length === 0) return 0;

    const setA = new Set(wordsA);
    const setB = new Set(wordsB);

    const intersection = new Set([...setA].filter((word) => setB.has(word)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size; // Jaccard similarity
  }

  /**
   * Normalize text for comparison
   */
  static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, "") // Remove punctuation
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  }

  /**
   * Calculate combined similarity score using multiple algorithms
   */
  static combinedSimilarity(a: string, b: string): number {
    const levenshtein = this.similarityScore(a, b);
    const wordSim = this.wordSimilarity(a, b);

    // Weight word similarity higher for medical conversations
    return levenshtein * 0.4 + wordSim * 0.6;
  }
}

/**
 * Overlap processor for handling overlapping audio chunks and transcriptions
 */
export class OverlapProcessor {
  private readonly overlapThreshold = 0.7; // Minimum similarity to consider overlap
  private readonly mergeThreshold = 0.8; // Minimum similarity to auto-merge
  private readonly medicalTerms: Set<string>;

  constructor() {
    // Common medical terms that should be preserved during merging
    this.medicalTerms = new Set([
      "symptom",
      "diagnosis",
      "treatment",
      "medication",
      "prescription",
      "blood",
      "pressure",
      "temperature",
      "heart",
      "rate",
      "pain",
      "infection",
      "allergy",
      "chronic",
      "acute",
      "patient",
      "doctor",
      "nurse",
      "hospital",
      "clinic",
      "emergency",
      "surgery",
      "therapy",
    ]);
  }

  /**
   * Detect overlaps between consecutive transcription segments
   */
  detectOverlaps(segments: TranscriptionSegment[]): OverlapDetection[] {
    const overlaps: OverlapDetection[] = [];

    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];

      const overlap = this.findOverlapBetweenSegments(current, next);
      if (overlap) {
        overlaps.push(overlap);
      }
    }

    logger.audio.debug("Overlap detection completed", {
      totalSegments: segments.length,
      overlapsFound: overlaps.length,
      avgSimilarity:
        overlaps.length > 0
          ? overlaps.reduce((sum, o) => sum + o.similarity, 0) / overlaps.length
          : 0,
    });

    return overlaps;
  }

  /**
   * Find overlap between two transcription segments
   */
  private findOverlapBetweenSegments(
    segment1: TranscriptionSegment,
    segment2: TranscriptionSegment,
  ): OverlapDetection | null {
    const text1 = segment1.text.trim();
    const text2 = segment2.text.trim();

    if (!text1 || !text2) return null;

    // Calculate various similarity metrics
    const similarity = TextSimilarity.combinedSimilarity(text1, text2);
    const lcs = TextSimilarity.longestCommonSubstring(text1, text2);

    // Check if similarity meets threshold
    if (similarity < this.overlapThreshold) return null;

    // Calculate confidence based on multiple factors
    const confidence = this.calculateOverlapConfidence(
      segment1,
      segment2,
      similarity,
      lcs,
    );

    // Determine merge recommendation
    const mergeRecommended =
      similarity >= this.mergeThreshold && confidence > 0.7;

    return {
      segments: [segment1, segment2],
      similarity,
      overlapStart: lcs.startA,
      overlapEnd: lcs.startA + lcs.length,
      confidence,
      mergeRecommended,
    };
  }

  /**
   * Calculate confidence score for overlap detection
   */
  private calculateOverlapConfidence(
    segment1: TranscriptionSegment,
    segment2: TranscriptionSegment,
    similarity: number,
    lcs: ReturnType<typeof TextSimilarity.longestCommonSubstring>,
  ): number {
    let confidence = similarity;

    // Boost confidence for longer common substrings
    const lcsRatio =
      lcs.length / Math.min(segment1.text.length, segment2.text.length);
    confidence += lcsRatio * 0.2;

    // Boost confidence if segments are close in time
    const timeDiff = Math.abs(segment1.timestamp - segment2.timestamp);
    if (timeDiff < 5000) {
      // Within 5 seconds
      confidence += 0.1;
    }

    // Boost confidence if both segments have high transcription confidence
    const avgTranscriptionConfidence =
      (segment1.confidence + segment2.confidence) / 2;
    confidence += (avgTranscriptionConfidence - 0.5) * 0.2;

    // Boost confidence for medical terms
    const medicalTermBoost = this.calculateMedicalTermBoost(
      segment1.text,
      segment2.text,
    );
    confidence += medicalTermBoost;

    // Penalize if one segment was timeout-forced (may be unreliable)
    if (
      segment1.chunkMetadata.isTimeoutForced ||
      segment2.chunkMetadata.isTimeoutForced
    ) {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Calculate boost for medical terms in overlap
   */
  private calculateMedicalTermBoost(text1: string, text2: string): number {
    const words1 = TextSimilarity.normalizeText(text1).split(/\s+/);
    const words2 = TextSimilarity.normalizeText(text2).split(/\s+/);

    const medicalWords1 = words1.filter((word) => this.medicalTerms.has(word));
    const medicalWords2 = words2.filter((word) => this.medicalTerms.has(word));

    const commonMedicalWords = medicalWords1.filter((word) =>
      medicalWords2.includes(word),
    );

    if (commonMedicalWords.length === 0) return 0;

    // Boost confidence based on number of common medical terms
    return Math.min(0.15, commonMedicalWords.length * 0.05);
  }

  /**
   * Merge overlapping transcription segments
   */
  mergeSegments(segments: TranscriptionSegment[]): MergedTranscription {
    const overlaps = this.detectOverlaps(segments);
    const mergedSegments: TranscriptionSegment[] = [];
    const processedIndices = new Set<number>();
    let mergedCount = 0;
    let duplicatesRemoved = 0;

    for (let i = 0; i < segments.length; i++) {
      if (processedIndices.has(i)) continue;

      const currentSegment = segments[i];
      const applicableOverlaps = overlaps.filter(
        (overlap) =>
          (overlap.segments[0] === currentSegment ||
            overlap.segments[1] === currentSegment) &&
          overlap.mergeRecommended,
      );

      if (applicableOverlaps.length === 0) {
        // No overlap, keep segment as is
        mergedSegments.push(currentSegment);
        processedIndices.add(i);
      } else {
        // Merge with overlapping segments
        const segmentsToMerge = new Set([currentSegment]);
        const indicesToProcess = new Set([i]);

        // Collect all segments that should be merged together
        for (const overlap of applicableOverlaps) {
          for (const segment of overlap.segments) {
            segmentsToMerge.add(segment);
            const index = segments.indexOf(segment);
            if (index !== -1) {
              indicesToProcess.add(index);
            }
          }
        }

        const merged = this.performMerge(Array.from(segmentsToMerge));
        mergedSegments.push(merged);

        // Mark all involved segments as processed
        indicesToProcess.forEach((idx) => processedIndices.add(idx));
        mergedCount++;
        duplicatesRemoved += segmentsToMerge.size - 1;
      }
    }

    // Calculate final text and statistics
    const finalText = mergedSegments
      .map((segment) => segment.text)
      .join(" ")
      .trim();
    const avgConfidence =
      mergedSegments.reduce((sum, s) => sum + s.confidence, 0) /
      mergedSegments.length;

    const result: MergedTranscription = {
      text: finalText,
      confidence: avgConfidence,
      segments: mergedSegments,
      overlapDetections: overlaps,
      processingMetadata: {
        totalSegments: segments.length,
        mergedSegments: mergedCount,
        duplicatesRemoved,
        averageConfidence: avgConfidence,
      },
    };

    logger.audio.info("Transcription merge completed", {
      originalSegments: segments.length,
      finalSegments: mergedSegments.length,
      overlapsDetected: overlaps.length,
      segmentsMerged: mergedCount,
      duplicatesRemoved,
      finalTextLength: finalText.length,
      averageConfidence: avgConfidence.toFixed(3),
    });

    return result;
  }

  /**
   * Perform the actual merging of segments
   */
  private performMerge(segments: TranscriptionSegment[]): TranscriptionSegment {
    if (segments.length === 1) return segments[0];

    // Sort by timestamp to maintain chronological order
    segments.sort((a, b) => a.timestamp - b.timestamp);

    // Use the segment with highest confidence as base
    const baseSegment = segments.reduce((max, segment) =>
      segment.confidence > max.confidence ? segment : max,
    );

    // Intelligently merge text content
    const mergedText = this.mergeTextContent(segments.map((s) => s.text));

    // Calculate weighted confidence
    const totalLength = segments.reduce((sum, s) => sum + s.text.length, 0);
    const weightedConfidence = segments.reduce(
      (sum, s) => sum + (s.confidence * s.text.length) / totalLength,
      0,
    );

    return {
      text: mergedText,
      confidence: Math.min(
        weightedConfidence,
        Math.max(...segments.map((s) => s.confidence)),
      ),
      timestamp: Math.min(...segments.map((s) => s.timestamp)),
      chunkMetadata: baseSegment.chunkMetadata,
      processed: true,
    };
  }

  /**
   * Intelligently merge text content from multiple segments
   */
  private mergeTextContent(texts: string[]): string {
    if (texts.length === 1) return texts[0];

    // Find the longest text as base
    let baseText = texts.reduce((longest, current) =>
      current.length > longest.length ? current : longest,
    );

    // For each other text, see if it adds meaningful content
    for (const text of texts) {
      if (text === baseText) continue;

      const similarity = TextSimilarity.combinedSimilarity(baseText, text);

      if (similarity < 0.8) {
        // Texts are different enough to potentially combine
        const lcs = TextSimilarity.longestCommonSubstring(baseText, text);

        if (lcs.length > Math.min(baseText.length, text.length) * 0.3) {
          // Significant overlap - merge intelligently
          baseText = this.mergeOverlappingTexts(baseText, text, lcs);
        } else {
          // No significant overlap - concatenate with space
          baseText += " " + text;
        }
      }
    }

    return baseText.trim().replace(/\s+/g, " ");
  }

  /**
   * Merge two overlapping texts based on longest common substring
   */
  private mergeOverlappingTexts(
    text1: string,
    text2: string,
    lcs: ReturnType<typeof TextSimilarity.longestCommonSubstring>,
  ): string {
    // Take the beginning of the first text
    const prefix = text1.substring(0, lcs.startA);

    // Take the common part
    const commonPart = lcs.substring;

    // Take the end of the longer text after the common part
    const suffix1 = text1.substring(lcs.startA + lcs.length);
    const suffix2 = text2.substring(lcs.startB + lcs.length);
    const suffix = suffix1.length > suffix2.length ? suffix1 : suffix2;

    return (prefix + commonPart + suffix).trim();
  }

  /**
   * Update medical terms dictionary (for medical consultation optimization)
   */
  updateMedicalTerms(terms: string[]): void {
    terms.forEach((term) => this.medicalTerms.add(term.toLowerCase()));
    logger.audio.debug("Medical terms updated", {
      newTerms: terms.length,
      totalTerms: this.medicalTerms.size,
    });
  }

  /**
   * Get processing statistics
   */
  getStatistics(): {
    overlapThreshold: number;
    mergeThreshold: number;
    medicalTermsCount: number;
  } {
    return {
      overlapThreshold: this.overlapThreshold,
      mergeThreshold: this.mergeThreshold,
      medicalTermsCount: this.medicalTerms.size,
    };
  }
}

// Export singleton instance
export const overlapProcessor = new OverlapProcessor();
