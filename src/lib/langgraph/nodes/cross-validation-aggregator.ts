/**
 * Cross-Validation Aggregator Node
 *
 * Collects feature refinements from all processing nodes and reconciles them
 * to create a comprehensive, accurate view of the document's content.
 */

import type {
  DocumentProcessingState,
  AIFeatureDetectionResults,
} from "../state";
import type { EnhancedProcessingResult } from "../interfaces/processing-result";
import type { FeatureFlagRefinement } from "../interfaces/feature-refinement";
import {
  SchemaDependencyAnalyzer,
  type CrossValidationInsights,
} from "../validation/schema-dependency-analyzer";

export interface AggregatedRefinements {
  // Final reconciled feature flags
  finalFlags: Record<string, boolean>;

  // Confidence scores for each flag
  confidenceScores: Record<string, number>;

  // Processing nodes that contributed to each flag
  contributors: Record<string, string[]>;

  // Conflicts that were resolved
  resolvedConflicts: ConflictResolution[];

  // New features discovered during processing
  discoveredFeatures: string[];

  // Schema-based cross-validation insights
  crossValidationInsights?: CrossValidationInsights;
}

export interface ConflictResolution {
  feature: string;
  processors: Array<{
    processorId: string;
    value: boolean;
    confidence: number;
  }>;
  resolution: boolean;
  reason: string;
}

/**
 * Aggregates and reconciles feature refinements from all processors
 */
export async function crossValidationAggregatorNode(
  state: DocumentProcessingState,
): Promise<Partial<DocumentProcessingState>> {
  console.log(
    "🔄 Cross-validation aggregator: Reconciling feature refinements...",
  );

  try {
    // Collect all processing results with refinements
    const processingResults = collectProcessingResults(state);

    if (processingResults.length === 0) {
      console.log("⚠️ No processing results found for aggregation");
      return {};
    }

    // Aggregate all feature refinements
    const aggregated = aggregateRefinements(
      state.featureDetectionResults || {},
      processingResults,
    );

    // Perform schema-based cross-validation
    const extractedData = collectExtractedData(state, processingResults);
    const schemaValidationResults =
      await SchemaDependencyAnalyzer.validateCrossSchemaConsistency(
        extractedData,
      );
    const crossValidationInsights =
      SchemaDependencyAnalyzer.generateCrossValidationInsights(
        schemaValidationResults,
      );

    // Integrate schema validation insights into aggregated results
    aggregated.crossValidationInsights = crossValidationInsights;

    // Adjust confidence scores based on schema validation
    adjustConfidenceBasedOnSchemaValidation(
      aggregated,
      crossValidationInsights,
    );

    // Build updated feature detection results
    const updatedFeatureDetection = buildUpdatedFeatureDetection(
      state.featureDetectionResults || {},
      aggregated,
    );

    // Log aggregation results
    logAggregationResults(aggregated);

    return {
      // Update feature detection with refined results
      featureDetectionResults: updatedFeatureDetection,

      // Store aggregation metadata
      metadata: {
        ...state.metadata,
        crossValidation: {
          performedAt: new Date().toISOString(),
          processorsContributed: processingResults.length,
          featuresRefined: Object.keys(aggregated.finalFlags).length,
          newFeaturesDiscovered: aggregated.discoveredFeatures.length,
          conflictsResolved: aggregated.resolvedConflicts.length,
        },
      },
    };
  } catch (error) {
    console.error("❌ Cross-validation aggregation error:", error);
    return {
      errors: [
        ...(state.errors || []),
        {
          node: "cross_validation_aggregator",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}

/**
 * Collect all processing results that include feature refinements
 */
function collectProcessingResults(
  state: DocumentProcessingState,
): EnhancedProcessingResult[] {
  const results: EnhancedProcessingResult[] = [];

  // In a real implementation, this would collect results from all processing nodes
  // For now, we'll simulate by checking known result locations
  const processorKeys = [
    "signalProcessingResult",
    "imagingProcessingResult",
    "pathologyProcessingResult",
    "oncologyProcessingResult",
    "cardiacAnalysisResult",
  ];

  for (const key of processorKeys) {
    const result = (state as any)[key];
    if (result?.featureRefinements) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Aggregate refinements from all processors
 */
function aggregateRefinements(
  originalDetection: AIFeatureDetectionResults,
  processingResults: EnhancedProcessingResult[],
): AggregatedRefinements {
  const aggregated: AggregatedRefinements = {
    finalFlags: {},
    confidenceScores: {},
    contributors: {},
    resolvedConflicts: [],
    discoveredFeatures: [],
  };

  // Start with original detection flags
  const allFlags = new Set<string>();
  const flagVotes: Record<
    string,
    Array<{ processorId: string; value: boolean; confidence: number }>
  > = {};

  // Collect all flags from original detection
  Object.keys(originalDetection).forEach((key) => {
    if (key.startsWith("has") && typeof (originalDetection as any)[key] === "boolean") {
      allFlags.add(key);
      flagVotes[key] = [
        {
          processorId: "ai-feature-detection",
          value: (originalDetection as any)[key],
          confidence: 0.8, // Base confidence for AI detection
        },
      ];
    }
  });

  // Collect votes from all processors
  for (const result of processingResults) {
    if (!result.featureRefinements) continue;

    const refinements = result.featureRefinements;
    const processorId =
      refinements.processorInsights[0]?.processorId || "unknown";

    // Add refined flags
    Object.entries(refinements.refinedFlags).forEach(([flag, value]) => {
      allFlags.add(flag);

      if (!flagVotes[flag]) {
        flagVotes[flag] = [];
      }

      flagVotes[flag].push({
        processorId,
        value,
        confidence: refinements.confidenceAdjustments[flag] || 0.7,
      });

      // Track contributors
      if (!aggregated.contributors[flag]) {
        aggregated.contributors[flag] = [];
      }
      aggregated.contributors[flag].push(processorId);
    });

    // Track newly discovered features
    refinements.newlyDetectedFeatures.forEach((feature) => {
      if (!aggregated.discoveredFeatures.includes(feature)) {
        aggregated.discoveredFeatures.push(feature);
      }
    });
  }

  // Resolve conflicts and determine final flags
  for (const flag of allFlags) {
    const votes = flagVotes[flag] || [];
    const resolution = resolveConflict(flag, votes);

    aggregated.finalFlags[flag] = resolution.finalValue;
    aggregated.confidenceScores[flag] = resolution.finalConfidence;

    if (resolution.hadConflict) {
      aggregated.resolvedConflicts.push({
        feature: flag,
        processors: votes,
        resolution: resolution.finalValue,
        reason: resolution.reason,
      });
    }
  }

  return aggregated;
}

/**
 * Resolve conflicts when processors disagree on a feature
 */
function resolveConflict(
  flag: string,
  votes: Array<{ processorId: string; value: boolean; confidence: number }>,
): {
  finalValue: boolean;
  finalConfidence: number;
  hadConflict: boolean;
  reason: string;
} {
  if (votes.length === 0) {
    return {
      finalValue: false,
      finalConfidence: 0,
      hadConflict: false,
      reason: "No votes",
    };
  }

  if (votes.length === 1) {
    return {
      finalValue: votes[0].value,
      finalConfidence: votes[0].confidence,
      hadConflict: false,
      reason: "Single vote",
    };
  }

  // Check if all votes agree
  const allAgree = votes.every((v) => v.value === votes[0].value);
  if (allAgree) {
    const avgConfidence =
      votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;
    return {
      finalValue: votes[0].value,
      finalConfidence: Math.min(avgConfidence * 1.1, 1.0), // Boost confidence when all agree
      hadConflict: false,
      reason: "Unanimous agreement",
    };
  }

  // Resolve conflict using weighted voting
  const trueWeight = votes
    .filter((v) => v.value === true)
    .reduce((sum, v) => sum + v.confidence, 0);

  const falseWeight = votes
    .filter((v) => v.value === false)
    .reduce((sum, v) => sum + v.confidence, 0);

  const finalValue = trueWeight > falseWeight;
  const totalWeight = trueWeight + falseWeight;
  const winningWeight = finalValue ? trueWeight : falseWeight;
  const finalConfidence = winningWeight / totalWeight;

  return {
    finalValue,
    finalConfidence,
    hadConflict: true,
    reason: `Weighted voting: ${trueWeight.toFixed(2)} (true) vs ${falseWeight.toFixed(2)} (false)`,
  };
}

/**
 * Build updated feature detection results
 */
function buildUpdatedFeatureDetection(
  original: AIFeatureDetectionResults,
  aggregated: AggregatedRefinements,
): AIFeatureDetectionResults {
  const updated = { ...original };

  // Update all boolean flags
  Object.entries(aggregated.finalFlags).forEach(([flag, value]) => {
    if (flag in updated) {
      (updated as any)[flag] = value;
    }
  });

  // Add discovered features to tags if highly confident
  aggregated.discoveredFeatures.forEach((feature) => {
    const confidence = aggregated.confidenceScores[feature] || 0;
    if (confidence > 0.8 && !updated.tags.includes(feature)) {
      updated.tags.push(feature);
    }
  });

  return updated;
}

/**
 * Collect extracted data from all processing results for schema validation
 */
function collectExtractedData(
  state: DocumentProcessingState,
  processingResults: EnhancedProcessingResult[],
): Record<string, any> {
  const extractedData: Record<string, any> = {};

  // Map processing results to schema names
  const schemaMapping = {
    "signal-processing": "core.signals",
    "medical-analysis": "core.summary",
    "specimen-processing": "specimens",
    "microscopic-processing": "microscopic",
    "ecg-processing": "ecg",
    "anesthesia-processing": "anesthesia",
  };

  // Collect data from each processing result
  for (const result of processingResults) {
    const processorId =
      result.featureRefinements?.processorInsights[0]?.processorId;
    if (
      processorId &&
      schemaMapping[processorId as keyof typeof schemaMapping]
    ) {
      const schemaName =
        schemaMapping[processorId as keyof typeof schemaMapping];
      extractedData[schemaName] = result.extractedData;
    }
  }

  // Also include data from state for core schemas
  if (state.medicalAnalysis?.content) {
    extractedData["core.diagnosis"] = state.medicalAnalysis.content.diagnosis;
    extractedData["core.bodyParts"] = state.medicalAnalysis.content.bodyParts;
    extractedData["core.performer"] = state.medicalAnalysis.content.performer;
    extractedData["core.recommendations"] =
      state.medicalAnalysis.content.recommendations;
  }

  return extractedData;
}

/**
 * Adjust confidence scores based on schema validation insights
 */
function adjustConfidenceBasedOnSchemaValidation(
  aggregated: AggregatedRefinements,
  insights: CrossValidationInsights,
): void {
  // Boost confidence for features that pass cross-schema validation
  const consistencyBoost = insights.overallConsistency * 0.1;

  for (const [flag, confidence] of Object.entries(
    aggregated.confidenceScores,
  )) {
    // Boost confidence if overall consistency is high
    if (insights.overallConsistency > 0.8) {
      aggregated.confidenceScores[flag] = Math.min(
        confidence + consistencyBoost,
        1.0,
      );
    }

    // Apply specific confidence adjustments from insights
    if (insights.confidenceAdjustments[flag]) {
      aggregated.confidenceScores[flag] = insights.confidenceAdjustments[flag];
    }
  }

  // Reduce confidence for features with critical issues
  for (const issue of insights.criticalIssues) {
    if (aggregated.confidenceScores[issue.field]) {
      aggregated.confidenceScores[issue.field] *= 0.7; // Reduce by 30%
    }
  }
}

/**
 * Log aggregation results for debugging
 */
function logAggregationResults(aggregated: AggregatedRefinements): void {
  console.log("\n📊 Cross-Validation Results:");
  console.log(
    `   Total features evaluated: ${Object.keys(aggregated.finalFlags).length}`,
  );
  console.log(
    `   New features discovered: ${aggregated.discoveredFeatures.length}`,
  );
  if (aggregated.discoveredFeatures.length > 0) {
    console.log(`   - ${aggregated.discoveredFeatures.join(", ")}`);
  }

  console.log(`   Conflicts resolved: ${aggregated.resolvedConflicts.length}`);
  aggregated.resolvedConflicts.forEach((conflict) => {
    console.log(
      `   - ${conflict.feature}: ${conflict.resolution} (${conflict.reason})`,
    );
  });

  // Log schema validation insights
  if (aggregated.crossValidationInsights) {
    const insights = aggregated.crossValidationInsights;
    console.log(`\n🔗 Schema Cross-Validation:`);
    console.log(
      `   Overall consistency: ${(insights.overallConsistency * 100).toFixed(1)}%`,
    );
    console.log(`   Critical issues: ${insights.criticalIssues.length}`);

    if (insights.criticalIssues.length > 0) {
      insights.criticalIssues.forEach((issue) => {
        console.log(
          `   - ${issue.severity.toUpperCase()}: ${issue.message} (${issue.field})`,
        );
      });
    }

    if (insights.suggestions.length > 0) {
      console.log(
        `   Suggestions: ${insights.suggestions.slice(0, 3).join(", ")}`,
      );
    }
  }

  // Log high-confidence features
  const highConfidence = Object.entries(aggregated.confidenceScores)
    .filter(([_, conf]) => conf > 0.9)
    .map(([flag, conf]) => `${flag} (${(conf * 100).toFixed(0)}%)`);

  if (highConfidence.length > 0) {
    console.log(`   High confidence features: ${highConfidence.join(", ")}`);
  }
}
