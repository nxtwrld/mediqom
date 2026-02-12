import type { DocumentProcessingState } from "../state";
import { fetchGptEnhanced } from "$lib/ai/providers/enhanced-abstraction";
import featureDetection from "$lib/configurations/feature-detection";
import anatomyTags from "$lib/configurations/tags";
import type { FunctionDefinition } from "@langchain/core/language_models/base";
import { log } from "$lib/logging/logger";
import { isStateTransitionDebuggingEnabled } from "$lib/config/logging-config";
import { recordWorkflowStep } from "$lib/debug/workflow-recorder";

export const featureDetectionNode = async (
  state: DocumentProcessingState,
): Promise<Partial<DocumentProcessingState>> => {
  const stepStartTime = Date.now();

  console.log("🔍 Feature Detection Node - Progress Debug:", {
    hasProgressCallback: !!state.progressCallback,
    progressCallbackType: typeof state.progressCallback,
    hasEmitProgress: !!state.emitProgress,
    emitProgressType: typeof state.emitProgress,
    stateKeys: Object.keys(state).filter(
      (k) => k.includes("progress") || k.includes("emit"),
    ),
  });

  // Create local progress emitters if we have a progress callback
  const hasCallback = !!state.progressCallback;

  const emitProgress = hasCallback
    ? (stage: string, progress: number, message: string) => {
        state.progressCallback?.({
          type: "progress",
          stage,
          progress,
          message,
          timestamp: Date.now(),
        });
      }
    : state.emitProgress;

  const emitComplete = hasCallback
    ? (stage: string, message: string, data?: any) => {
        state.progressCallback?.({
          type: "progress",
          stage,
          progress: 100,
          message,
          data,
          timestamp: Date.now(),
        });
      }
    : state.emitComplete;

  const emitError = hasCallback
    ? (stage: string, message: string, error?: any) => {
        state.progressCallback?.({
          type: "error",
          stage,
          progress: 0,
          message,
          data: error,
          timestamp: Date.now(),
        });
      }
    : state.emitError;

  // Emit progress start
  emitProgress?.("feature_detection", 0, "Starting feature detection analysis");

  try {
    // Use existing feature detection configuration
    emitProgress?.("feature_detection", 20, "Loading feature detection schema");
    const schema = featureDetection as FunctionDefinition;

    // Populate tags enum with anatomy tags for constrained AI output
    const params = schema.parameters as any;
    if (params?.properties?.tags?.items) {
      params.properties.tags.items.enum = [...anatomyTags];
    }

    // Perform feature detection using enhanced AI provider
    emitProgress?.(
      "feature_detection",
      40,
      "Analyzing document features with AI",
    );

    // Initialize token usage tracking
    const tokenUsage = { ...state.tokenUsage };

    const result = await fetchGptEnhanced(
      state.content,
      schema,
      tokenUsage,
      state.language || "English",
      "feature_detection",
      hasCallback
        ? (stage, progress, message) => {
            // Convert AI progress to node progress (map 0-100% to 40-70% of node progress)
            const nodeProgress = 40 + progress * 0.3;
            state.progressCallback?.({
              type: "progress",
              stage: `feature_detection_${stage}`,
              progress: nodeProgress,
              message: `AI: ${message}`,
              timestamp: Date.now(),
            });
          }
        : undefined,
    );

    // Update token usage
    emitProgress?.("feature_detection", 70, "Processing AI response");

    // Extract feature detection results - enhanced provider returns parsed data directly
    emitProgress?.(
      "feature_detection",
      90,
      "Extracting feature analysis results",
    );

    const parsedResult = result || {};

    // Verbose logging of AI results
    log.analysis.debug("Feature detection AI response:", {
      parsedResult,
      hasCategory: !!parsedResult.category,
      hasNotMedical: !!parsedResult.notMedical,
      hasTags: !!parsedResult.tags,
      tagsLength: parsedResult.tags?.length || 0,
    });

    // Log the boolean flags we received
    console.log("📋 Feature Detection - AI Response Boolean Flags:", {
      hasPrescriptions: parsedResult.hasPrescriptions,
      hasImmunizations: parsedResult.hasImmunizations,
      hasSignals: parsedResult.hasSignals,
      hasDiagnosis: parsedResult.hasDiagnosis,
      hasBodyParts: parsedResult.hasBodyParts,
      documentType: parsedResult.documentType,
      isMedical: parsedResult.isMedical,
    });

    const featureDetectionResult = {
      type: parsedResult.category || "unknown",
      confidence: parsedResult.notMedical ? 0 : 0.9,
      features: parsedResult.tags || [],
    };

    log.analysis.info("Feature detection results:", {
      type: featureDetectionResult.type,
      confidence: featureDetectionResult.confidence,
      featuresCount: featureDetectionResult.features.length,
      isMedical: !parsedResult.notMedical,
    });

    // Emit completion
    emitComplete?.(
      "feature_detection",
      "Feature detection completed successfully",
      {
        category: featureDetectionResult.type,
        confidence: featureDetectionResult.confidence,
        featuresFound: featureDetectionResult.features.length,
        tokensUsed: tokenUsage.feature_detection || 0,
        isMedical: !parsedResult.notMedical,
      },
    );

    // Create AI feature detection results for router compatibility
    const aiFeatureDetectionResults = {
      isMedical: !parsedResult.notMedical,
      isMedicalImaging: parsedResult.isMedicalImaging || false,
      language: parsedResult.language || state.language || "English",
      documentType:
        parsedResult.documentType || parsedResult.category || "unknown",
      medicalSpecialty: parsedResult.medicalSpecialty || [],
      urgencyLevel: parsedResult.urgencyLevel || 1,
      tags: parsedResult.tags || [],

      // Core section flags - use actual values from AI response
      hasSummary: parsedResult.hasSummary || false,
      hasDiagnosis: parsedResult.hasDiagnosis || false,
      hasBodyParts: parsedResult.hasBodyParts || false,
      hasPerformer: parsedResult.hasPerformer || false,
      hasRecommendations: parsedResult.hasRecommendations || false,
      hasSignals: parsedResult.hasSignals || false,
      hasPrescriptions: parsedResult.hasPrescriptions || false,
      hasImmunizations: parsedResult.hasImmunizations || false,

      // Medical specialty section flags - use actual values from AI response
      hasImaging: parsedResult.hasImaging || false,
      hasDental: parsedResult.hasDental || false,
      hasAdmission: parsedResult.hasAdmission || false,
      hasProcedures: parsedResult.hasProcedures || false,
      hasAnesthesia: parsedResult.hasAnesthesia || false,
      hasSpecimens: parsedResult.hasSpecimens || false,
      hasMicroscopic: parsedResult.hasMicroscopic || false,
      hasMolecular: parsedResult.hasMolecular || false,
      hasECG: parsedResult.hasECG || false,
      hasEcho: parsedResult.hasEcho || false,
      hasTriage: parsedResult.hasTriage || false,
      hasTreatments: parsedResult.hasTreatments || false,
      hasAssessment: parsedResult.hasAssessment || false,

      // Enhanced specialty section flags - use actual values from AI response
      hasTumorCharacteristics: parsedResult.hasTumorCharacteristics || false,
      hasTreatmentPlan: parsedResult.hasTreatmentPlan || false,
      hasTreatmentResponse: parsedResult.hasTreatmentResponse || false,
      hasImagingFindings: parsedResult.hasImagingFindings || false,
      hasGrossFindings: parsedResult.hasGrossFindings || false,
      hasSpecialStains: parsedResult.hasSpecialStains || false,
      hasAllergies: parsedResult.hasAllergies || false,
      hasMedications: parsedResult.hasMedications || false,
      hasSocialHistory: parsedResult.hasSocialHistory || false,
    };

    // Verbose logging of state being returned (only if enabled)
    if (isStateTransitionDebuggingEnabled()) {
      log.analysis.debug("Feature detection node returning state", {
        featureDetection: featureDetectionResult,
        featureDetectionResults: {
          isMedical: aiFeatureDetectionResults.isMedical,
          documentType: aiFeatureDetectionResults.documentType,
          language: aiFeatureDetectionResults.language,
          tags: aiFeatureDetectionResults.tags,
        },
        tokenUsageTotal: tokenUsage.total,
      });
    }

    // Log key results
    console.log("🔍 Feature Detection Results:", {
      documentType: aiFeatureDetectionResults.documentType,
      hasPrescriptions: aiFeatureDetectionResults.hasPrescriptions,
      hasImmunizations: aiFeatureDetectionResults.hasImmunizations,
      hasSignals: aiFeatureDetectionResults.hasSignals,
    });

    const outputState = {
      featureDetection: featureDetectionResult,
      featureDetectionResults: aiFeatureDetectionResults,
      tokenUsage,
    };

    // Record workflow step for debugging
    const stepDuration = Date.now() - stepStartTime;
    recordWorkflowStep(
      "feature_detection",
      state,
      { ...state, ...outputState },
      stepDuration,
      [], // AI requests are recorded in enhanced abstraction
      [],
      {
        provider: "enhanced-openai",
        flowType: "feature_detection",
        confidence: featureDetectionResult.confidence,
        documentType: aiFeatureDetectionResults.documentType,
      },
    );

    return outputState;
  } catch (error) {
    log.analysis.error("Feature detection error:", error);

    // Emit error
    emitError?.("feature_detection", "Feature detection failed", error);

    const errorState = {
      errors: [
        ...(state.errors || []),
        {
          node: "feature_detection",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // Record failed step for debugging
    const stepDuration = Date.now() - stepStartTime;
    recordWorkflowStep(
      "feature_detection",
      state,
      { ...state, ...errorState },
      stepDuration,
      [],
      [error instanceof Error ? error.message : String(error)],
      {
        provider: "enhanced-openai",
        flowType: "feature_detection",
        failed: true,
      },
    );

    return errorState;
  }
};
