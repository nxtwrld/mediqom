/**
 * Medical Imaging Workflow
 *
 * Specialized workflow for processing medical imaging files (DICOM, X-rays, MRIs, CTs, etc.)
 * Follows the unified-workflow patterns with dedicated medical imaging nodes.
 */

import { StateGraph, END } from "@langchain/langgraph";
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

  // Create state graph with medical imaging state interface
  const workflow = new StateGraph<MedicalImagingState>({
    channels: {
      // Input channels
      images: { reducer: (current: any, update: any) => update ?? current },
      text: { reducer: (current: any, update: any) => update ?? current },
      language: { reducer: (current: any, update: any) => update ?? current },
      metadata: { reducer: (current: any, update: any) => update ?? current },
      content: { reducer: (current: any, update: any) => update ?? current },

      // Medical imaging specific channels
      imagingMetadata: {
        reducer: (current: any, update: any) => update ?? current,
      },
      imageAnalysis: {
        reducer: (current: any, update: any) => update ?? current,
      },
      detectedBodyParts: {
        reducer: (current: any, update: any) => update ?? current,
      },
      detectedAnomalies: {
        reducer: (current: any, update: any) => update ?? current,
      },
      measurements: {
        reducer: (current: any, update: any) => update ?? current,
      },
      primaryAnatomicalRegion: {
        reducer: (current: any, update: any) => update ?? current,
      },
      urgentFindings: {
        reducer: (current: any, update: any) => update ?? current,
      },

      // Patient and performer channels
      patientInfo: {
        reducer: (current: any, update: any) => update ?? current,
      },
      medicalPerformers: {
        reducer: (current: any, update: any) => update ?? current,
      },
      patientPerformerDetection: {
        reducer: (current: any, update: any) => update ?? current,
      },

      // Unified result structure (following unified workflow pattern)
      medicalImagingAnalysis: {
        reducer: (current: any, update: any) => update ?? current,
      },

      // Workflow control channels
      tokenUsage: { reducer: (current: any, update: any) => update ?? current },
      errors: { reducer: (current: any, update: any) => update ?? current },
      progressCallback: {
        reducer: (current: any, update: any) => update ?? current,
      },
      emitProgress: {
        reducer: (current: any, update: any) => update ?? current,
      },
      selectedProvider: {
        reducer: (current: any, update: any) => update ?? current,
      },
    },
  });

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
  workflow
    .addEdge("__start__", "patient_performer_detection" as any)
    .addEdge("patient_performer_detection" as any, "medical_imaging_analysis" as any)
    .addEdge("medical_imaging_analysis" as any, END);

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
