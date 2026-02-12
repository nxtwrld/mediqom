import { StateGraph, END } from "@langchain/langgraph";
import type {
  DocumentProcessingState,
  WorkflowConfig,
  ProgressCallback,
  ProgressEvent,
} from "../state";
import {
  isLangGraphDebuggingEnabled,
  isWorkflowTracingEnabled,
} from "$lib/config/logging-config";
import {
  startWorkflowRecording,
  finishWorkflowRecording,
  isWorkflowReplayMode,
  workflowRecorder,
} from "$lib/debug/workflow-recorder";
import { createWorkflowReplay } from "$lib/debug/workflow-replay";

// Import core workflow nodes (essential workflow structure)
import { inputValidationNode } from "../nodes/input-validation";
import { featureDetectionNode } from "../nodes/feature-detection";
import { providerSelectionNode } from "../nodes/provider-selection";
import { externalValidationNode } from "../nodes/external-validation";
import { qualityGateNode } from "../nodes/quality-gate";
import { documentTypeRouterNode } from "../nodes/document-type-router";

// Import unified multi-node processing
import { executeMultiNodeProcessing } from "./multi-node-orchestrator";

// Conditional edge functions
const shouldProcessMedical = (state: DocumentProcessingState): string => {
  if (state.errors && state.errors.length > 0) {
    console.log(
      "🚫 shouldProcessMedical: Routing to error due to processing errors",
      {
        errorsCount: state.errors.length,
        errors: state.errors,
      },
    );
    return "error";
  }

  // Check if medical processing is needed based on feature detection
  console.log("🔍 shouldProcessMedical: Checking feature detection", {
    hasFeatureDetection: !!state.featureDetection,
    confidence: state.featureDetection?.confidence,
    type: state.featureDetection?.type,
    hasFeatureDetectionResults: !!state.featureDetectionResults,
    isMedical: state.featureDetectionResults?.isMedical,
  });

  if (state.featureDetection && state.featureDetection.confidence > 0.5) {
    console.log("✅ shouldProcessMedical: Routing to medical analysis", {
      confidence: state.featureDetection.confidence,
      type: state.featureDetection.type,
    });
    return "medical";
  }

  // Also check if we have alternative feature detection results indicating medical content
  if (
    state.featureDetectionResults &&
    state.featureDetectionResults.isMedical
  ) {
    console.log(
      "✅ shouldProcessMedical: Routing to medical analysis (via featureDetectionResults)",
      {
        isMedical: state.featureDetectionResults.isMedical,
        documentType: state.featureDetectionResults.documentType,
      },
    );
    return "medical";
  }

  console.log(
    "🚫 shouldProcessMedical: Routing to error - not medical or low confidence",
    {
      featureDetectionConfidence: state.featureDetection?.confidence,
      isMedical: state.featureDetectionResults?.isMedical,
    },
  );
  return "error";
};

const shouldValidateExternally = (state: DocumentProcessingState): string => {
  // Only validate externally if configured and signals exist
  // For Phase 1, always skip external validation
  // This will be enabled in Phase 5
  return "skip";
};

const shouldUseEnhancedSchema = (state: DocumentProcessingState): string => {
  // Route to enhanced schema processing if document type detected
  if (
    state.documentTypeAnalysis?.detectedType &&
    state.documentTypeAnalysis.confidence > 0.7
  ) {
    return "enhanced";
  }
  return "standard";
};

// Create the document processing workflow
export const createDocumentProcessingWorkflow = (
  config?: WorkflowConfig,
  progressCallback?: ProgressCallback,
) => {
  // Create wrapper functions for nodes that have access to the progress callback
  const createNodeWrapper = (nodeFn: any) => {
    return async (state: DocumentProcessingState) => {
      // Ensure progress callback is always available for live workflow execution
      const enhancedState = {
        ...state,
        progressCallback: progressCallback || state.progressCallback,
      };
      return await nodeFn(enhancedState);
    };
  };

  // Create state graph with DocumentProcessingState type
  const workflow = new StateGraph<DocumentProcessingState>({
    channels: {
      images: null,
      text: null,
      language: null,
      metadata: null,
      content: null,
      tokenUsage: null,
      featureDetection: null,
      featureDetectionResults: null, // ← Missing field added!
      medicalAnalysis: null,
      signals: null,
      report: null, // Add report channel
      documentTypeAnalysis: null,
      selectedSchema: null,
      processingComplexity: null,
      selectedProvider: null,
      providerMetadata: null,
      validationResults: null,
      relationships: null,
      confidence: null,
      errors: null,
      processingErrors: null,
      // Progress tracking fields (functions won't serialize but we need the channels)
      progressCallback: null,
      currentStage: null,
      stageProgress: null,
      totalStages: null,
      completedStages: null,
      emitProgress: null,
      emitComplete: null,
      emitError: null,
    },
  });

  // Core workflow nodes (wrapped to preserve progress callback)
  workflow.addNode("input_validation", createNodeWrapper(inputValidationNode));
  workflow.addNode(
    "feature_detection",
    createNodeWrapper(featureDetectionNode),
  );
  workflow.addNode(
    "multi_node_processing",
    createNodeWrapper(executeMultiNodeProcessing),
  );

  // Enhanced nodes (new capabilities)
  workflow.addNode(
    "provider_selection",
    createNodeWrapper(providerSelectionNode),
  );
  workflow.addNode(
    "document_type_router",
    createNodeWrapper(documentTypeRouterNode),
  );
  workflow.addNode(
    "external_validation",
    createNodeWrapper(externalValidationNode),
  );
  workflow.addNode("quality_gate", createNodeWrapper(qualityGateNode));

  // Define simplified workflow edges for unified processing
  workflow.addEdge("input_validation" as any, "document_type_router" as any);
  workflow.addEdge("document_type_router" as any, "provider_selection" as any);
  workflow.addEdge("provider_selection" as any, "feature_detection" as any);

  // Conditional routing after feature detection - now goes to unified multi-node processing
  workflow.addConditionalEdges("feature_detection" as any, shouldProcessMedical, {
    medical: "multi_node_processing" as any,
    error: END,
  });

  // Conditional external validation after multi-node processing
  workflow.addConditionalEdges(
    "multi_node_processing" as any,
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

// Helper function to create progress emitter functions
const createProgressEmitters = (
  progressCallback?: ProgressCallback,
  totalStages: number = 6,
) => {
  let completedStages = 0;

  const emitProgress = (
    stage: string,
    progress: number,
    message: string,
    data?: any,
  ) => {
    if (progressCallback) {
      const overallProgress =
        ((completedStages + progress / 100) / totalStages) * 100;

      // Only log if LangGraph debugging is enabled
      if (isLangGraphDebuggingEnabled()) {
        console.log(
          `🔄 LangGraph Progress: ${stage} (${progress}%) - ${message}`,
        );
      }

      progressCallback({
        type: "progress",
        stage,
        progress: Math.min(overallProgress, 100),
        message,
        data,
        timestamp: Date.now(),
      });
    }
  };

  const emitComplete = (stage: string, message: string, data?: any) => {
    completedStages++;
    if (progressCallback) {
      const overallProgress = (completedStages / totalStages) * 100;

      // Only log if LangGraph debugging is enabled
      if (isLangGraphDebuggingEnabled()) {
        console.log(
          `✅ LangGraph Complete: ${stage} - ${message} (${completedStages}/${totalStages})`,
        );
      }

      progressCallback({
        type: "progress",
        stage,
        progress: Math.min(overallProgress, 100),
        message,
        data,
        timestamp: Date.now(),
      });
    }
  };

  const emitError = (stage: string, message: string, error?: any) => {
    if (progressCallback) {
      progressCallback({
        type: "error",
        stage,
        progress: 0,
        message,
        data: error,
        timestamp: Date.now(),
      });
    }
  };

  return {
    emitProgress,
    emitComplete,
    emitError,
    totalStages,
    completedStages,
  };
};

// Export unified workflow as primary implementation
export { runUnifiedDocumentProcessingWorkflow as runDocumentProcessingWorkflow } from "./unified-workflow";

// Legacy implementation kept for backward compatibility
export async function runDocumentProcessingWorkflowLegacy(
  images?: string[],
  text?: string,
  language?: string,
  config?: WorkflowConfig,
  progressCallback?: ProgressCallback,
) {
  // Check for replay mode first
  if (isWorkflowReplayMode()) {
    const replayFilePath = workflowRecorder.getReplayFilePath();
    if (replayFilePath) {
      console.log(
        "🔄 Replay mode detected, loading workflow from:",
        replayFilePath,
      );
      // In replay mode, we don't run the live workflow, only replay recorded events
      return await replayWorkflowFromFile(replayFilePath, progressCallback);
    }
  }

  // Start recording if enabled
  const recordingId = startWorkflowRecording("analysis", {
    images,
    text,
    language,
    ...config,
  });

  // Logging is now configured via environment variables
  if (isWorkflowTracingEnabled()) {
    console.log(
      "🔍 LangGraph workflow tracing enabled via environment configuration",
    );
    if (recordingId) {
      console.log("📹 Workflow recording started:", recordingId);
    }
  }
  const workflow = createDocumentProcessingWorkflow(config, progressCallback);

  // Create progress emitters
  const { emitProgress, emitComplete, emitError, totalStages } =
    createProgressEmitters(progressCallback);

  // Create a shared context for progress tracking that persists across nodes
  const progressContext = {
    callback: progressCallback,
    emitProgress,
    emitComplete,
    emitError,
  };

  // Initialize state with progress tracking
  const initialState: DocumentProcessingState = {
    images,
    text,
    language,
    content: [],
    tokenUsage: { total: 0 },
    progressCallback,
    totalStages,
    completedStages: 0,
    emitProgress,
    emitComplete,
    emitError,
  };

  try {
    // Emit initial progress
    emitProgress("workflow_start", 0, "Starting document processing workflow");

    console.log("🔍 Workflow Progress Debug:", {
      hasProgressCallback: !!progressCallback,
      progressCallbackType: typeof progressCallback,
      emitProgressType: typeof emitProgress,
      isFunction: typeof progressCallback === "function",
    });

    if (isWorkflowTracingEnabled()) {
      console.log("🚀 Starting LangGraph workflow execution");
      console.log("📋 Initial state:", {
        hasImages: !!images,
        hasText: !!text,
        language,
        hasProgressCallback: !!progressCallback,
      });
    }

    // Run the workflow
    const result = await workflow.invoke(initialState);

    if (isWorkflowTracingEnabled()) {
      console.log("✅ LangGraph workflow completed");
      console.log("📊 Final result:", {
        hasSignals: !!result.signals?.length,
        signalsCount: result.signals?.length || 0,
        hasErrors: !!result.errors?.length,
        errorsCount: result.errors?.length || 0,
        totalTokens: result.tokenUsage?.total || 0,
      });
    }

    // Prepare the final result in backwards-compatible format
    const finalResult = {
      content: result.medicalAnalysis?.content || {},
      medicalAnalysis: result.medicalAnalysis, // Include full medicalAnalysis for detailed mapping
      tokenUsage: result.tokenUsage,
      signals: result.signals || [],
      error:
        result.errors && result.errors.length > 0
          ? result.errors[0].error
          : undefined,
    };

    // For SSE: Don't send completion event here - let the SSE endpoint handle it
    // The SSE endpoint will convert the result and send the completion event
    if (progressCallback) {
      // For now, just send a progress event to indicate workflow completion
      // The SSE endpoint will send the actual completion event with converted data
      progressCallback({
        type: "progress",
        stage: "workflow_complete",
        progress: 100,
        message: "Document processing completed successfully",
        data: {
          signalsFound: result.signals?.length || 0,
          tokensUsed: result.tokenUsage?.total || 0,
        },
        timestamp: Date.now(),
      });
    }

    // Finish recording if enabled
    if (recordingId) {
      const savedFile = finishWorkflowRecording(finalResult);
      if (savedFile && isWorkflowTracingEnabled()) {
        console.log("📹 Workflow recording saved to:", savedFile);
      }
    }

    // Return the result for the SSE endpoint to convert and send as completion
    return finalResult;
  } catch (error) {
    console.error("Workflow execution error:", error);

    // Finish recording with error if enabled
    if (recordingId) {
      const errorResult = {
        content: {},
        tokenUsage: { total: 0 },
        signals: [],
        error: error instanceof Error ? error.message : String(error),
      };
      finishWorkflowRecording(errorResult);
    }

    // Emit error
    emitError("workflow_error", "Workflow execution failed", error);

    return {
      content: {},
      tokenUsage: { total: 0 },
      signals: [],
      error: error instanceof Error ? error.message : String(error),
    };
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
  const finalResult = recording.finalResult;

  console.log("✅ Workflow replay completed:", {
    stepsReplayed: replayResults.length,
    successful: replayResults.filter((r) => r.success).length,
    failed: replayResults.filter((r) => !r.success).length,
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

  return finalResult;
}
