/**
 * Unified Workflow - Clean Implementation
 *
 * This replaces the existing document-processing.ts with a cleaner,
 * unified approach using the multi-node orchestrator for ALL specialized processing.
 */

import { StateGraph, END } from "@langchain/langgraph";
import type {
  DocumentProcessingState,
  WorkflowConfig,
  ProgressCallback,
} from "../state";
// Logging config no longer needed here - using workflow recorder's debug state
import {
  startWorkflowRecording,
  finishWorkflowRecording,
  isWorkflowReplayMode,
  isWorkflowRecordingEnabled,
  workflowRecorder,
} from "$lib/debug/workflow-recorder";
import { createWorkflowReplay } from "$lib/debug/workflow-replay";

// Import essential workflow nodes only
import { inputValidationNode } from "../nodes/input-validation";
import { featureDetectionNode } from "../nodes/feature-detection";
import { providerSelectionNode } from "../nodes/provider-selection";
import { externalValidationNode } from "../nodes/external-validation";
import { qualityGateNode } from "../nodes/quality-gate";
import { documentTypeRouterNode } from "../nodes/document-type-router";
import { medicalTermsGenerationNode } from "../nodes/medical-terms-generation";

// Import unified multi-node processing
import { executeMultiNodeProcessing } from "./multi-node-orchestrator";

// Simplified conditional edge functions
const shouldProcessMedical = (state: DocumentProcessingState): string => {
  if (state.errors && state.errors.length > 0) {
    console.log("🚫 Errors detected - skipping processing");
    return "error";
  }

  // Check if medical processing is needed
  const isMedical =
    state.featureDetectionResults?.isMedical ||
    (state.featureDetection && state.featureDetection.confidence > 0.5);

  if (isMedical) {
    console.log(
      "✅ Medical content detected - proceeding to multi-node processing",
    );
    return "medical";
  }

  console.log("🚫 Non-medical content - skipping processing");
  return "error";
};

const shouldValidateExternally = (state: DocumentProcessingState): string => {
  // For Phase 1, always skip external validation
  // This will be enabled in Phase 3
  return "skip";
};

// Create the unified document processing workflow
export const createUnifiedDocumentProcessingWorkflow = (
  config?: WorkflowConfig,
  progressCallback?: ProgressCallback,
) => {
  // Create wrapper functions for nodes that have access to the progress callback
  // Each node gets assigned a progress range to avoid conflicts
  const createNodeWrapper = (
    nodeFn: any,
    nodeProgressRange: { start: number; end: number },
  ) => {
    return async (state: DocumentProcessingState) => {
      const enhancedState = {
        ...state,
        progressCallback: progressCallback || state.progressCallback,
        emitProgress: (stage: string, progress: number, message: string) => {
          // Calculate cumulative progress for this node
          const nodeProgress =
            nodeProgressRange.start +
            (progress * (nodeProgressRange.end - nodeProgressRange.start)) /
              100;

          if (state.progressCallback) {
            state.progressCallback({
              type: "progress",
              stage,
              progress: Math.min(nodeProgress, 100),
              message,
              timestamp: Date.now(),
            });
          }

          // Also call the original emitProgress if it exists
          state.emitProgress?.(stage, Math.min(nodeProgress, 100), message);
        },
      };
      return await nodeFn(enhancedState);
    };
  };

  // Create state graph with state interface
  const workflow = new StateGraph<DocumentProcessingState>({
    channels: {
      // Input channels
      images: { reducer: (current: any, update: any) => update ?? current },
      text: { reducer: (current: any, update: any) => update ?? current },
      language: { reducer: (current: any, update: any) => update ?? current },
      metadata: { reducer: (current: any, update: any) => update ?? current },
      content: { reducer: (current: any, update: any) => update ?? current },

      // Core processing channels
      tokenUsage: { reducer: (current: any, update: any) => update ?? current },
      featureDetection: {
        reducer: (current: any, update: any) => update ?? current,
      },
      featureDetectionResults: {
        reducer: (current: any, update: any) => update ?? current,
      },

      // Multi-node results channels
      medicalAnalysis: {
        reducer: (current: any, update: any) => update ?? current,
      },
      signals: { reducer: (current: any, update: any) => update ?? current },
      imaging: { reducer: (current: any, update: any) => update ?? current },
      medications: {
        reducer: (current: any, update: any) => update ?? current,
      },
      procedures: { reducer: (current: any, update: any) => update ?? current },
      multiNodeResults: {
        reducer: (current: any, update: any) => update ?? current,
      },
      report: { reducer: (current: any, update: any) => update ?? current },

      // Medical terms generation channel
      medicalTermsGeneration: {
        reducer: (current: any, update: any) => update ?? current,
      },

      // Workflow control channels
      documentTypeAnalysis: {
        reducer: (current: any, update: any) => update ?? current,
      },
      selectedProvider: {
        reducer: (current: any, update: any) => update ?? current,
      },
      providerMetadata: {
        reducer: (current: any, update: any) => update ?? current,
      },
      validationResults: {
        reducer: (current: any, update: any) => update ?? current,
      },
      confidence: { reducer: (current: any, update: any) => update ?? current },
      errors: { reducer: (current: any, update: any) => update ?? current },

      // Progress tracking channels
      progressCallback: {
        reducer: (current: any, update: any) => update ?? current,
      },
      currentStage: {
        reducer: (current: any, update: any) => update ?? current,
      },
      emitProgress: {
        reducer: (current: any, update: any) => update ?? current,
      },
      emitComplete: {
        reducer: (current: any, update: any) => update ?? current,
      },
      emitError: { reducer: (current: any, update: any) => update ?? current },
    },
  });

  // Add essential workflow nodes with progress ranges
  workflow.addNode(
    "input_validation",
    createNodeWrapper(inputValidationNode, { start: 30, end: 40 }),
  );
  workflow.addNode(
    "document_type_router",
    createNodeWrapper(documentTypeRouterNode, { start: 40, end: 50 }),
  );
  workflow.addNode(
    "provider_selection",
    createNodeWrapper(providerSelectionNode, { start: 50, end: 60 }),
  );
  workflow.addNode(
    "feature_detection",
    createNodeWrapper(featureDetectionNode, { start: 60, end: 70 }),
  );
  workflow.addNode(
    "multi_node_processing",
    createNodeWrapper(executeMultiNodeProcessing, { start: 70, end: 85 }),
  );
  workflow.addNode(
    "medical_terms_generation",
    createNodeWrapper(medicalTermsGenerationNode, { start: 85, end: 90 }),
  );
  workflow.addNode(
    "external_validation",
    createNodeWrapper(externalValidationNode, { start: 95, end: 98 }),
  );
  workflow.addNode(
    "quality_gate",
    createNodeWrapper(qualityGateNode, { start: 98, end: 100 }),
  );

  // Define clean workflow flow
  workflow.addEdge("input_validation" as any, "document_type_router" as any);
  workflow.addEdge("document_type_router" as any, "provider_selection" as any);
  workflow.addEdge("provider_selection" as any, "feature_detection" as any);

  // Route to unified multi-node processing or end
  workflow.addConditionalEdges("feature_detection" as any, shouldProcessMedical, {
    medical: "multi_node_processing" as any,
    error: END,
  });

  // Add medical terms generation after multi-node processing
  workflow.addEdge("multi_node_processing" as any, "medical_terms_generation" as any);

  // External validation (optional)
  workflow.addConditionalEdges(
    "medical_terms_generation" as any,
    shouldValidateExternally,
    {
      validate: "external_validation" as any,
      skip: "quality_gate" as any,
    },
  );

  workflow.addEdge("external_validation" as any, "quality_gate" as any);
  workflow.addEdge("quality_gate" as any, END);

  // Set entry point
  workflow.setEntryPoint("input_validation" as any);

  // Compile the workflow
  return workflow.compile();
};

// Main execution function with debugging support
export async function runUnifiedDocumentProcessingWorkflow(
  images: any[],
  text: string,
  language: string,
  config: WorkflowConfig = {},
  progressCallback?: ProgressCallback,
): Promise<DocumentProcessingState> {
  const debugEnabled = isWorkflowRecordingEnabled();

  console.log("🎯 Starting Unified Document Processing Workflow", {
    hasImages: images && images.length > 0,
    hasText: !!text,
    language,
    config,
    debugEnabled,
  });

  // Check if we're in replay mode
  if (isWorkflowReplayMode()) {
    const replayFilePath = workflowRecorder.getReplayFilePath();
    if (replayFilePath) {
      console.log("🔄 Using workflow replay mode with file:", replayFilePath);
      return await replayWorkflowFromFile(replayFilePath, progressCallback);
    } else {
      console.warn(
        "⚠️ Replay mode enabled but no replay file path found, falling back to live execution",
      );
    }
  }

  // Start recording if debugging enabled
  let recordingId: string | undefined;
  if (debugEnabled) {
    recordingId =
      startWorkflowRecording("analysis", {
        workflowType: "unified-document-processing",
        inputs: { images, text, language, config },
      }) || undefined;
  }

  try {
    // Create workflow
    const workflow = createUnifiedDocumentProcessingWorkflow(
      config,
      progressCallback,
    );

    // Create initial state
    const initialState: DocumentProcessingState = {
      images,
      text,
      language: language || "English",
      content: text ? [{ type: "text" as const, text }] : [], // Fix content to be proper array
      metadata: {},
      tokenUsage: { total: 0 },
      errors: [],
      progressCallback,
      // Explicitly initialize report as empty to prevent any default array assignment
      report: undefined,
    };

    console.log("🚀 Executing unified workflow...");

    // Execute workflow
    const result = await workflow.invoke(initialState);

    console.log("✅ Unified workflow completed successfully");

    if (debugEnabled) {
      console.log("📊 Final workflow result:", {
        hasMultiNodeResults: !!result.multiNodeResults,
        processedNodes: result.multiNodeResults?.processedNodes || [],
        errors: result.errors?.length || 0,
        tokenUsage: result.tokenUsage?.total || 0,
      });
    }

    // Finish recording if we started one
    if (recordingId && debugEnabled) {
      console.log(
        "WorkflowRecorder: 🎬 Attempting to finish workflow recording:",
        recordingId,
      );
      const savedFile = finishWorkflowRecording(result);
      if (savedFile) {
        console.log(
          "WorkflowRecorder: 📹 Workflow recording saved to:",
          savedFile,
        );
      } else {
        console.log("WorkflowRecorder: ❌ Failed to save workflow recording");
      }
    }

    return result;
  } catch (error) {
    console.error("❌ Unified workflow error:", error);

    // Still save recording on error
    if (recordingId && debugEnabled) {
      console.log(
        "WorkflowRecorder: 💥 Saving recording on error for:",
        recordingId,
      );
      const errorResult = {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      finishWorkflowRecording(errorResult);
    }

    throw error;
  }
}

/**
 * Replay a workflow from a saved recording file
 */
async function replayWorkflowFromFile(
  filePath: string,
  progressCallback?: ProgressCallback,
): Promise<any> {
  const replay = createWorkflowReplay(filePath);
  if (!replay) {
    throw new Error(`Failed to load workflow recording from: ${filePath}`);
  }

  const summary = replay.getWorkflowSummary();
  console.log("🔄 Replaying workflow:", {
    recordingId: summary.recordingId,
    phase: summary.phase,
    steps: summary.totalSteps,
    originalDuration: summary.totalDuration,
    originalTokens: summary.totalTokenUsage.total,
  });

  // Emit initial progress - continue from where extraction left off
  if (progressCallback) {
    progressCallback({
      type: "progress",
      stage: "analysis_start",
      progress: 30, // Continue from extraction progress
      message: `Starting analysis replay: ${summary.recordingId}`,
      data: {
        originalSteps: summary.totalSteps,
        originalDuration: summary.totalDuration,
        phase: "analysis",
      },
      timestamp: Date.now(),
    });
  }

  // Replay the workflow step by step with live progress events
  const replayResults: any[] = [];
  const totalSteps = summary.totalSteps;
  let stepIndex = 0;

  while (true) {
    const result = replay.executeNextStep();
    if (!result) break;

    replayResults.push(result);
    stepIndex++;

    // Emit progress for each step as it's replayed
    if (progressCallback) {
      // Calculate progress as continuation from extraction (assume extraction was ~30% of total)
      const analysisProgress = (stepIndex / totalSteps) * 100;
      const overallProgress = 30 + analysisProgress * 0.7; // Analysis takes remaining 70%

      progressCallback({
        type: "progress",
        stage: result.stepName,
        progress: Math.min(overallProgress, 100),
        message: `Replaying step: ${result.stepName}`,
        data: {
          stepId: result.stepId,
          success: result.success,
          stepIndex,
          totalSteps,
        },
        timestamp: Date.now(),
      });
    }

    // Add configurable delay between steps to show progress
    const delayMs = workflowRecorder.getReplayDelay();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Get the final result from the recording
  const recording = replay.exportResults().recording;

  // Use the recorded final result directly - don't re-run multi-node processing
  console.log(
    "🔄 Using recorded workflow result directly (no duplicate processing)",
  );
  const finalState = recording.steps[recording.steps.length - 1].outputState;

  // The workflow was already completed during recording, so use that result
  const aggregatedResult = recording.finalResult || finalState;

  console.log("✅ Workflow replay completed with updated aggregation:", {
    stepsReplayed: replayResults.length,
    successful: replayResults.filter((r) => r.success).length,
    failed: replayResults.filter((r) => !r.success).length,
    hasReport: !!(aggregatedResult as any)?.report,
    reportType: typeof (aggregatedResult as any)?.report,
  });

  // Emit completion
  if (progressCallback) {
    progressCallback({
      type: "progress",
      stage: "analysis_complete",
      progress: 100,
      message: "Analysis replay completed successfully",
      data: {
        stepsReplayed: replayResults.length,
        originalTokens: recording.totalTokenUsage.total,
        phase: "analysis",
      },
      timestamp: Date.now(),
    });
  }

  // Return the aggregated result instead of just the recording's final result
  // Ensure we always return a valid result object
  const finalResult = {
    ...finalState,
    ...(aggregatedResult || {}),
    // Fallback values if aggregation failed
    tokenUsage: aggregatedResult?.tokenUsage ||
      finalState.tokenUsage || { total: 0 },
    errors: aggregatedResult?.errors || finalState.errors || [],
  };

  console.log("🎯 Final result being returned:", {
    resultType: typeof finalResult,
    hasTokenUsage: !!finalResult.tokenUsage,
    hasReport: !!(finalResult as any).report,
    reportType: typeof (finalResult as any).report,
    keysCount: Object.keys(finalResult).length,
  });

  return finalResult;
}

// Backward compatibility export
export const runDocumentProcessingWorkflow =
  runUnifiedDocumentProcessingWorkflow;
