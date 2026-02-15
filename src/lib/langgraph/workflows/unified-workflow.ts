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
import { saveNodeResult } from "$lib/import.server/debug-output";
import { DEBUG_IMPORT } from "$env/static/private";

// Import essential workflow nodes only
import { inputValidationNode } from "../nodes/input-validation";
import { featureDetectionNode } from "../nodes/feature-detection";
import { providerSelectionNode } from "../nodes/provider-selection";
import { externalValidationNode } from "../nodes/external-validation";
import { qualityGateNode } from "../nodes/quality-gate";
import { documentTypeRouterNode } from "../nodes/document-type-router";
import { medicalTermsGenerationNode } from "../nodes/medical-terms-generation";

// Import new LangGraph-native multi-node system
import { multiNodeDispatcherNode } from "../nodes/multi-node-dispatcher";
import { resultsAggregatorNode } from "../nodes/results-aggregator";

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
      // Token usage: accumulate across all nodes
      tokenUsage: {
        reducer: (current: any, update: any) => {
          if (!update) return current || { total: 0 };
          return {
            total: (current?.total || 0) + (update?.total || 0),
          };
        },
      },
      featureDetection: {
        reducer: (current: any, update: any) => update ?? current,
      },
      featureDetectionResults: {
        reducer: (current: any, update: any) => update ?? current,
      },

      // Multi-node results channels
      // These receive updates from MULTIPLE parallel nodes via Send API
      medicalAnalysis: {
        reducer: (current: any, update: any) => update ?? current,
      },
      // Signals: accumulate arrays from all signal-processing nodes
      signals: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ signals reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      // Imaging: merge objects from imaging nodes
      imaging: {
        reducer: (current: any, update: any) => {
          if (!update) return current;
          return { ...(current || {}), ...(update || {}) };
        },
      },
      // Medications: accumulate arrays from medication-processing nodes
      medications: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ medications reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      // Procedures: accumulate arrays from procedure-processing nodes
      procedures: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ procedures reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      // Multi-node results: merge metadata from dispatcher and aggregator
      multiNodeResults: {
        reducer: (current: any, update: any) => {
          if (!update) return current;
          return {
            ...current,
            ...update,
            processedNodes: [
              ...(current?.processedNodes || []),
              ...(update?.processedNodes || []),
            ],
          };
        },
      },
      // Report: merge objects from all medical processing nodes
      report: {
        reducer: (current: any, update: any) => {
          if (!update) return current;
          return { ...(current || {}), ...(update || {}) };
        },
      },

      // Additional medical section channels (populated by specialized nodes)
      diagnosis: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ diagnosis reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      performer: {
        reducer: (current: any, update: any) => update ?? current,
      },
      patient: {
        reducer: (current: any, update: any) => update ?? current,
      },
      bodyParts: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ bodyParts reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      ecg: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ ecg reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      echo: {
        reducer: (current: any, update: any) => update ?? current,
      },
      allergies: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ allergies reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      anesthesia: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ anesthesia reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      microscopic: {
        reducer: (current: any, update: any) => update ?? current,
      },
      triage: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ triage reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      immunizations: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ immunizations reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      specimens: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ specimens reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      admission: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ admission reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      dental: {
        reducer: (current: any, update: any) => update ?? current,
      },
      tumorCharacteristics: {
        reducer: (current: any, update: any) => update ?? current,
      },
      treatmentPlan: {
        reducer: (current: any, update: any) => update ?? current,
      },
      treatmentResponse: {
        reducer: (current: any, update: any) => update ?? current,
      },
      imagingFindings: {
        reducer: (current: any, update: any) => update ?? current,
      },
      grossFindings: {
        reducer: (current: any, update: any) => update ?? current,
      },
      specialStains: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ specialStains reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      socialHistory: {
        reducer: (current: any, update: any) => update ?? current,
      },
      treatments: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (update && !Array.isArray(update)) {
            console.warn('⚠️ treatments reducer received non-array update, ignoring:', typeof update);
            return current || [];
          }
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },
      assessment: {
        reducer: (current: any, update: any) => update ?? current,
      },
      molecular: {
        reducer: (current: any, update: any) => update ?? current,
      },

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
      // Errors: accumulate error arrays from all nodes
      errors: {
        reducer: (current: any[] | undefined, update: any[] | undefined) => {
          if (!update || update.length === 0) return current || [];
          return [...(current || []), ...update];
        },
      },

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

  // Add new multi-node dispatcher (executes specialized nodes directly)
  // Note: In LangGraph v0.0.26, Send API is not available, so the dispatcher
  // executes nodes directly using the nodeRegistry instead of routing via LangGraph.
  // Specialized nodes don't need to be registered in the workflow - they're
  // managed by the nodeRegistry and executed within the dispatcher node.
  workflow.addNode(
    "multi_node_dispatcher",
    createNodeWrapper(multiNodeDispatcherNode, { start: 70, end: 85 }),
  );

  // Add results aggregator to collect and validate parallel node results
  workflow.addNode(
    "results_aggregator",
    createNodeWrapper(resultsAggregatorNode, { start: 85, end: 87 }),
  );

  // Add medical terms generation node (runs after aggregation)
  workflow.addNode(
    "medical_terms_generation",
    createNodeWrapper(medicalTermsGenerationNode, { start: 87, end: 90 }),
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

  // Route to LangGraph-native multi-node dispatcher or end
  workflow.addConditionalEdges("feature_detection" as any, shouldProcessMedical, {
    medical: "multi_node_dispatcher" as any,
    error: END,
  });

  // Dispatcher uses Send API to route to specialized nodes in parallel
  // After all Send nodes complete, continue to results aggregator
  workflow.addEdge("multi_node_dispatcher" as any, "results_aggregator" as any);

  // After aggregation, continue to medical terms generation
  workflow.addEdge("results_aggregator" as any, "medical_terms_generation" as any);

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
      // Add jobId for debug output correlation
      jobId: config.jobId,
    };

    console.log("🚀 Executing unified workflow...");

    // Execute workflow with streaming to capture node results
    let currentState = initialState;
    const nodeResults: Record<string, any> = {};
    const debugImportEnabled = DEBUG_IMPORT === 'true';

    // Generate timestamp once for all nodes in this run
    const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Stream the workflow to capture each node's output
    for await (const chunk of await workflow.stream(initialState)) {
      const nodeName = Object.keys(chunk)[0];
      const nodeOutput = chunk[nodeName];

      currentState = { ...currentState, ...nodeOutput };
      nodeResults[nodeName] = nodeOutput;

      // Save node result if debugging is enabled and we have a jobId
      if (debugImportEnabled && config.jobId) {
        saveNodeResult(config.jobId, nodeName, nodeOutput, runTimestamp);
      }
    }

    const result = currentState;

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
