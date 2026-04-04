/**
 * Medical Imaging Workflow
 *
 * Specialized workflow for processing medical imaging files (DICOM, X-rays, MRIs, CTs, etc.)
 * Follows the unified-workflow patterns with dedicated medical imaging nodes.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type {
  MedicalImagingState,
  MedicalImagingWorkflowConfig as WorkflowConfig,
  MedicalImagingProgressCallback as ProgressCallback,
} from "../state-medical-imaging";
import {
  startWorkflowRecording,
  finishWorkflowRecording,
  isWorkflowReplayMode,
  isWorkflowRecordingEnabled,
  workflowRecorder,
} from "$lib/debug/workflow-recorder";
import { createWorkflowReplay } from "$lib/debug/workflow-replay";

// Import medical imaging nodes
import { patientPerformerDetectionNode } from "../nodes/patient-performer-detection";
import { medicalImagingAnalysisNode } from "../nodes/medical-imaging-analysis";

// Two-node workflow: Patient/Performer detection → Medical imaging analysis

// Create the medical imaging workflow
export const createMedicalImagingWorkflow = (
  config?: WorkflowConfig,
  progressCallback?: ProgressCallback,
) => {
  // Create wrapper functions for nodes with progress tracking
  const createNodeWrapper = (
    nodeFn: any,
    nodeProgressRange: { start: number; end: number },
  ) => {
    return async (state: MedicalImagingState) => {
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
              type: "progress" as const,
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

  // Define state graph using Annotation API
  const ImagingGraphState = Annotation.Root({
    // Input channels
    images: lastValue<any>(),
    text: lastValue<any>(),
    language: lastValue<any>(),
    metadata: lastValue<any>(),
    content: lastValue<any>(),

    // Medical imaging specific channels
    imagingMetadata: lastValue<any>(),
    imageAnalysis: lastValue<any>(),
    detectedBodyParts: lastValue<any>(),
    detectedAnomalies: lastValue<any>(),
    measurements: lastValue<any>(),
    primaryAnatomicalRegion: lastValue<any>(),
    urgentFindings: lastValue<any>(),

    // Patient and performer channels
    patientInfo: lastValue<any>(),
    medicalPerformers: lastValue<any>(),
    patientPerformerDetection: lastValue<any>(),

    // Unified result structure
    medicalImagingAnalysis: lastValue<any>(),

    // Workflow control channels
    tokenUsage: lastValue<any>(),
    errors: lastValue<any>(),
    progressCallback: lastValue<any>(),
    emitProgress: lastValue<any>(),
    selectedProvider: lastValue<any>(),
  });

  // Create state graph using Annotation
  const workflow = new StateGraph(ImagingGraphState) as any;

  // Add patient/performer detection node (metadata-only processing)
  workflow.addNode(
    "patient_performer_detection",
    createNodeWrapper(patientPerformerDetectionNode, { start: 0, end: 50 }),
  );

  // Add medical imaging analysis node (visual analysis with context)
  workflow.addNode(
    "medical_imaging_analysis",
    createNodeWrapper(medicalImagingAnalysisNode, { start: 50, end: 100 }),
  );

  // Define 2-node sequential workflow
  workflow.addEdge(START, "patient_performer_detection");
  workflow.addEdge("patient_performer_detection", "medical_imaging_analysis");
  workflow.addEdge("medical_imaging_analysis", END);

  return workflow.compile();
};

// Main medical imaging processing function
export const processMedicalImaging = async (
  state: MedicalImagingState,
  config?: WorkflowConfig,
  progressCallback?: ProgressCallback,
): Promise<MedicalImagingState> => {
  console.log("🔬 Starting Medical Imaging Workflow");

  // Initialize progress tracking
  if (progressCallback) {
    progressCallback({
      stage: "medical_imaging_init",
      progress: 0,
      message: "Initializing medical imaging analysis",
    });
  }

  let finalState: MedicalImagingState;

  try {
    // Check for workflow replay mode
    if (isWorkflowReplayMode()) {
      console.log("🔄 Running in replay mode");
      const replay = createWorkflowReplay("medical-imaging" as any);
      if (replay) {
        finalState = await (replay as any).executeStep(state);
      } else {
        // Fallback to normal execution if replay fails
        const workflow = createMedicalImagingWorkflow(config, progressCallback);
        finalState = await workflow.invoke(state);
      }
    } else {
      // Start workflow recording if enabled
      if (isWorkflowRecordingEnabled()) {
        await startWorkflowRecording("medical-imaging" as any, state);
      }

      // Create and execute the workflow
      const workflow = createMedicalImagingWorkflow(config, progressCallback);
      finalState = await workflow.invoke(state);

      // Finish workflow recording
      if (isWorkflowRecordingEnabled()) {
        await finishWorkflowRecording(finalState);
      }
    }

    // Final progress update
    if (progressCallback) {
      progressCallback({
        stage: "medical_imaging_complete",
        progress: 100,
        message: "Medical imaging analysis complete",
      });
    }

    console.log("✅ Medical Imaging Workflow completed successfully");
    return finalState;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Medical Imaging Workflow failed:", error);

    // Record error state if recording is enabled
    if (isWorkflowRecordingEnabled()) {
      const errorObject = {
        node: "medical-imaging-workflow",
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
      workflowRecorder.recordStep(
        "error",
        state,
        { ...state, errors: [...(state.errors || []), errorObject] },
        0,
        [],
        [errorMessage],
      );
      await finishWorkflowRecording({
        ...state,
        errors: [...(state.errors || []), errorObject],
      });
    }

    // Error progress update
    if (progressCallback) {
      progressCallback({
        stage: "medical_imaging_error",
        progress: 0,
        message: `Medical imaging analysis failed: ${errorMessage}`,
      });
    }

    throw error;
  }
};

// Export workflow components for testing
export { patientPerformerDetectionNode, medicalImagingAnalysisNode };
