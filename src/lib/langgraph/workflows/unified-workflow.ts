/**
 * Unified Workflow - Clean Implementation
 *
 * This replaces the existing document-processing.ts with a cleaner,
 * unified approach using the multi-node orchestrator for ALL specialized processing.
 */

import { Annotation, StateGraph, START, END, Send } from "@langchain/langgraph";
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
import { getLanguageEnglishName } from "$lib/languages";

// Import essential workflow nodes only
import { inputValidationNode } from "../nodes/input-validation";
import { featureDetectionNode } from "../nodes/feature-detection";
import { providerSelectionNode } from "../nodes/provider-selection";
import { externalValidationNode } from "../nodes/external-validation";
import { qualityGateNode } from "../nodes/quality-gate";
import { documentTypeRouterNode } from "../nodes/document-type-router";
import { medicalTermsGenerationNode } from "../nodes/medical-terms-generation";

// Node registry for dynamic specialized node dispatch
import { nodeRegistry } from "../registry/node-registry";
import { UniversalNodeFactory, NODE_CONFIGURATIONS } from "../factories/universal-node-factory";
import { resultsAggregatorNode } from "../nodes/results-aggregator";

// Bootstrap: register all factory-configured nodes into the registry once
let nodesRegistered = false;
function ensureNodesRegistered(): void {
  if (nodesRegistered) return;
  nodesRegistered = true;
  for (const [nodeId, config] of Object.entries(NODE_CONFIGURATIONS)) {
    nodeRegistry.registerNode({
      nodeName: config.nodeName,
      description: config.description,
      featureDetectionTriggers: config.triggers,
      priority: config.priority,
      nodeFunction: UniversalNodeFactory.createNode(nodeId),
    });
  }
  console.log(`📝 Registered ${Object.keys(NODE_CONFIGURATIONS).length} nodes into registry`);
}

// Dispatch function: returns Send[] for parallel fan-out, or falls through to END
const dispatchToSpecializedNodes = (
  state: DocumentProcessingState,
): string | Send[] => {
  const criticalErrors = (state.errors || []).filter((e: any) => {
    const msg = typeof e === 'string' ? e : e?.error || '';
    const node = typeof e === 'string' ? '' : e?.node || '';
    return !msg.toLowerCase().includes('feature') && node !== 'feature_detection';
  });

  if (criticalErrors.length > 0) {
    console.log("🚫 Critical errors detected - skipping processing:", criticalErrors);
    return END;
  }

  const featureDetectionFailed = (state.errors || []).some((e: any) => {
    const msg = typeof e === 'string' ? e : e?.error || '';
    const node = typeof e === 'string' ? '' : e?.node || '';
    return msg.toLowerCase().includes('feature') || node === 'feature_detection';
  });

  const isMedical =
    state.featureDetectionResults?.isMedical ||
    (state.featureDetection && state.featureDetection.confidence > 0.5);

  if (!isMedical && !featureDetectionFailed) {
    console.log("🚫 Non-medical content - skipping processing");
    return END;
  }

  if (featureDetectionFailed) {
    console.log("⚠️ Feature detection failed - defaulting to medical processing");
  } else {
    console.log("✅ Medical content detected - dispatching specialized nodes");
  }

  ensureNodesRegistered();
  const selectedNodes = nodeRegistry.selectNodes(state.featureDetectionResults!);

  if (selectedNodes.length === 0) {
    console.log("📝 No specialized nodes selected - skipping to aggregator");
    return "results_aggregator";
  }

  console.log(`📤 Dispatching ${selectedNodes.length} nodes in parallel: ${selectedNodes.map((n) => n.nodeName).join(", ")}`);
  return selectedNodes.map((node) =>
    new Send("run_specialized_node", { ...state, currentNodeId: node.nodeName }),
  );
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

  // Helper: last-write-wins reducer
  const lastValue = <T>() =>
    Annotation<T>({
      reducer: (current: any, update: any) => update ?? current,
      default: () => undefined as any,
    });

  // Helper: array accumulator reducer (for signals, medications, etc.)
  const accumArray = <T>() =>
    Annotation<T[]>({
      reducer: (current: any[] | undefined, update: any[] | undefined) => {
        if (update && !Array.isArray(update)) {
          console.warn(
            "⚠️ array reducer received non-array update, ignoring:",
            typeof update,
          );
          return current || [];
        }
        if (!update || update.length === 0) return current || [];
        return [...(current || []), ...update];
      },
      default: () => [],
    });

  // Helper: object merger reducer (for report, imaging, etc.)
  const mergeObject = <T>() =>
    Annotation<T>({
      reducer: (current: any, update: any) => {
        if (!update) return current;
        return { ...(current || {}), ...(update || {}) };
      },
      default: () => undefined as any,
    });

  // Define state graph using Annotation API
  const GraphState = Annotation.Root({
    // Input channels
    images: lastValue<any>(),
    text: lastValue<any>(),
    language: lastValue<any>(),
    metadata: lastValue<any>(),
    content: lastValue<any>(),

    // Core processing channels
    tokenUsage: Annotation<any>({
      reducer: (current: any, update: any) => {
        if (!update) return current || { total: 0 };
        return {
          total: (current?.total || 0) + (update?.total || 0),
        };
      },
      default: () => ({ total: 0 }),
    }),
    featureDetection: lastValue<any>(),
    featureDetectionResults: lastValue<any>(),

    // Multi-node results channels
    medicalAnalysis: lastValue<any>(),
    signals: accumArray<any>(),
    imaging: mergeObject<any>(),
    medications: accumArray<any>(),
    procedures: accumArray<any>(),
    multiNodeResults: Annotation<any>({
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
      default: () => undefined as any,
    }),
    report: mergeObject<any>(),

    // Additional medical section channels
    diagnosis: accumArray<any>(),
    performer: lastValue<any>(),
    patient: lastValue<any>(),
    bodyParts: accumArray<any>(),
    ecg: accumArray<any>(),
    echo: lastValue<any>(),
    allergies: accumArray<any>(),
    anesthesia: accumArray<any>(),
    microscopic: lastValue<any>(),
    triage: accumArray<any>(),
    immunizations: accumArray<any>(),
    specimens: accumArray<any>(),
    admission: accumArray<any>(),
    dental: lastValue<any>(),
    tumorCharacteristics: lastValue<any>(),
    treatmentPlan: lastValue<any>(),
    recommendationsDetailed: lastValue<any>(),
    treatmentResponse: lastValue<any>(),
    imagingFindings: lastValue<any>(),
    grossFindings: lastValue<any>(),
    specialStains: accumArray<any>(),
    socialHistory: lastValue<any>(),
    treatments: accumArray<any>(),
    assessment: lastValue<any>(),
    molecular: lastValue<any>(),

    // Medical terms generation channel
    medicalTermsGeneration: lastValue<any>(),

    // Workflow control channels
    documentTypeAnalysis: lastValue<any>(),
    selectedProvider: lastValue<any>(),
    providerMetadata: lastValue<any>(),
    validationResults: lastValue<any>(),
    confidence: lastValue<any>(),
    errors: accumArray<any>(),

    // Per-Send dispatch: which specialized node to run in this instance
    currentNodeId: lastValue<string>(),

    // Progress tracking channels
    progressCallback: lastValue<any>(),
    currentStage: lastValue<any>(),
    emitProgress: lastValue<any>(),
    emitComplete: lastValue<any>(),
    emitError: lastValue<any>(),
  });

  // Create state graph using Annotation
  // Use 'any' cast for workflow variable to work around strict nominal node-name typing
  // in LangGraph v1.x — node names are validated at runtime
  const workflow = new StateGraph(GraphState) as any;

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

  // Single handler node for all specialized nodes — dispatched in parallel via Send API.
  // LangGraph merges all parallel outputs via state reducers (accumArray, mergeObject, etc.)
  workflow.addNode(
    "run_specialized_node",
    createNodeWrapper(
      async (state: DocumentProcessingState) => {
        const node = nodeRegistry.getNode(state.currentNodeId!);
        if (!node) {
          return {
            errors: [
              ...(state.errors || []),
              { node: state.currentNodeId!, error: "Node not found in registry", timestamp: new Date().toISOString() },
            ],
          };
        }
        try {
          console.log(`⚡ Running specialized node: ${state.currentNodeId}`);
          const result = await node.nodeFunction(state);
          console.log(`✅ Completed specialized node: ${state.currentNodeId}`);
          return result;
        } catch (error) {
          console.error(`❌ Failed specialized node ${state.currentNodeId}:`, error);
          return {
            errors: [
              ...(state.errors || []),
              { node: state.currentNodeId!, error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() },
            ],
          };
        }
      },
      { start: 70, end: 85 },
    ),
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

  // Define clean workflow flow using START constant
  workflow.addEdge(START, "input_validation");
  workflow.addEdge("input_validation", "document_type_router");
  workflow.addEdge("document_type_router", "provider_selection");
  workflow.addEdge("provider_selection", "feature_detection");

  // Dispatch to specialized nodes in parallel via Send API, or fall through to END
  workflow.addConditionalEdges("feature_detection", dispatchToSpecializedNodes);

  // After all parallel run_specialized_node instances complete, LangGraph merges
  // their outputs via state reducers and proceeds to the aggregator
  workflow.addEdge("run_specialized_node", "results_aggregator");

  // After aggregation, continue to medical terms generation
  workflow.addEdge("results_aggregator", "medical_terms_generation");

  // External validation (optional)
  workflow.addConditionalEdges(
    "medical_terms_generation",
    shouldValidateExternally,
    {
      validate: "external_validation",
      skip: "quality_gate",
    },
  );

  workflow.addEdge("external_validation", "quality_gate");
  workflow.addEdge("quality_gate", END);

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
      language: getLanguageEnglishName(language) || "English",
      content: text ? [{ type: "text" as const, text }] : [], // Fix content to be proper array
      metadata: {},
      tokenUsage: { total: 0 },
      errors: [],
      progressCallback,
      // Explicitly initialize report as empty to prevent any default array assignment
      report: undefined,
      // Add jobId for debug output correlation
      jobId: config.jobId,
      // Care Plan extraction context (row 7d) — consumed by annotation-aware
      // nodes, never persisted.
      carePlanContext: config.carePlanContext,
    };

    console.log("🚀 Executing unified workflow...");

    // Execute workflow with streaming to capture node results
    let currentState = initialState;
    const nodeResults: Record<string, any> = {};
    const debugImportEnabled = DEBUG_IMPORT === "true";

    // Generate timestamp once for all nodes in this run
    const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");

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
