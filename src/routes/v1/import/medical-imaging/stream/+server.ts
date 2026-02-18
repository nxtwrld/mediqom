import { error, type RequestHandler } from "@sveltejs/kit";
import { processMedicalImaging } from "$lib/langgraph/workflows/medical-imaging-workflow";
import {
  checkScansAvailable,
  consumeScan,
} from "$lib/billing/subscription.server";
import type { MedicalImagingState } from "$lib/langgraph/state-medical-imaging";
import { log } from "$lib/logging/logger";
import { isSSEProgressDebuggingEnabled } from "$lib/config/logging-config";

interface ProgressEvent {
  type: "progress" | "complete" | "error";
  stage: string;
  progress: number;
  message: string;
  data?: any;
  timestamp: number;
}

export const POST: RequestHandler = async ({
  request,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const scansCheck = await checkScansAvailable(user.id);
  if (scansCheck.available <= 0) {
    error(403, { message: "Subscription limit reached" });
  }

  const data = await request.json();

  // Validate required fields
  if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
    error(400, { message: "No medical images provided" });
  }

  // Create SSE stream for real-time progress
  const stream = new ReadableStream({
    async start(controller) {
      log.sse.info("SSE medical imaging analysis stream started", {
        imageCount: data.images.length,
        isDicomExtracted: data.metadata?.isDicomExtracted || false,
        language: data.language || "English",
      });

      const sendEvent = (event: ProgressEvent) => {
        const message = `data: ${JSON.stringify(event)}\n\n`;

        // Log all progress events for debugging (only if enabled)
        if (isSSEProgressDebuggingEnabled()) {
          log.sse.debug("Sending SSE progress event", {
            type: event.type,
            stage: event.stage,
            progress: event.progress,
            message: event.message,
            hasData: !!event.data,
          });
        }

        try {
          controller.enqueue(new TextEncoder().encode(message));
        } catch (err) {
          log.sse.error("Error sending SSE event:", err);
        }
      };

      try {
        // Send initial progress - medical imaging analysis
        sendEvent({
          type: "progress",
          stage: "imaging_initialization",
          progress: 30, // Continue from where extraction left off
          message: "Starting medical imaging analysis...",
          data: { phase: "medical_imaging" },
          timestamp: Date.now(),
        });

        // Extract context information
        const isDicomExtracted = data.metadata?.isDicomExtracted || false;
        const dicomMetadata = data.metadata?.dicomMetadata;
        const language = data.language || "English";

        console.log(
          `🏥 Processing medical imaging SSE analysis (DICOM: ${isDicomExtracted})`,
        );

        // Send workflow initialization progress
        sendEvent({
          type: "progress",
          stage: "workflow_initialization",
          progress: 35,
          message: "Initializing medical imaging workflow...",
          timestamp: Date.now(),
        });

        // Create state for medical imaging workflow
        const imagingState: MedicalImagingState = {
          images: data.images,
          language,
          metadata: {
            isDicomExtracted,
            dicomMetadata,
            imageSource: isDicomExtracted ? "dicom" : "medical_upload",
          },
          content: [
            {
              type: "text" as const,
              text:
                isDicomExtracted && dicomMetadata
                  ? `DICOM Context:
- Modality: ${dicomMetadata.modality || "Unknown"}
- Body Part: ${dicomMetadata.bodyPartExamined || "Unknown"}
- Study: ${dicomMetadata.studyDescription || "Not specified"}
- View Position: ${dicomMetadata.viewPosition || "Unknown"}`
                  : "Medical imaging analysis",
            },
          ],
          // Initialize medical imaging specific fields
          imagingMetadata: dicomMetadata
            ? {
                modality: dicomMetadata.modality || "Unknown",
                bodyPartExamined: dicomMetadata.bodyPartExamined || "Unknown",
                studyDescription: dicomMetadata.studyDescription,
                viewPosition: dicomMetadata.viewPosition || "Unknown",
                studyDate: dicomMetadata.studyDate,
                isDicomExtracted,
              }
            : undefined,
          detectedBodyParts: [],
          detectedAnomalies: [],
          measurements: [],
          urgentFindings: false,
          // Required field for workflow
          tokenUsage: { total: 0 },
        };

        // Create progress callback to connect workflow to SSE
        const workflowProgressCallback = (event: {
          stage: string;
          progress: number;
          message: string;
          data?: any;
          nodeResults?: any;
        }) => {
          console.log("🔗 SSE: Workflow progress callback:", {
            stage: event.stage,
            progress: event.progress,
            message: event.message,
          });

          // Forward workflow progress to SSE stream
          sendEvent({
            type: "progress",
            stage: event.stage,
            progress: event.progress,
            message: event.message,
            data: event.data,
            timestamp: Date.now(),
          });
        };

        // Execute the medical imaging workflow with progress tracking
        console.log("🔬 SSE: Executing medical imaging workflow with state:", {
          hasImages: !!imagingState.images?.length,
          imageCount: imagingState.images?.length || 0,
          hasFeatureDetectionResults: !!imagingState.featureDetectionResults,
          featureDetectionResults: imagingState.featureDetectionResults,
          stateKeys: Object.keys(imagingState),
        });

        console.log("🚀 SSE: About to call processMedicalImaging...");
        const workflowStartTime = Date.now();

        const workflowResult = await processMedicalImaging(
          imagingState,
          undefined,
          workflowProgressCallback,
        );

        const workflowDuration = Date.now() - workflowStartTime;
        console.log(`⏱️ SSE: Workflow completed in ${workflowDuration}ms`);

        console.log(
          "🔬 SSE: Medical imaging workflow completed, result structure:",
          {
            resultKeys: Object.keys(workflowResult),
            hasMedicalImagingAnalysis: !!workflowResult.medicalImagingAnalysis,
            hasImageAnalysis: !!workflowResult.imageAnalysis,
            hasPatientInfo: !!workflowResult.patientInfo,
            performersCount: workflowResult.medicalPerformers?.length || 0,
            hasDetectedBodyParts: !!workflowResult.detectedBodyParts?.length,
            hasDetectedAnomalies: !!workflowResult.detectedAnomalies?.length,
          },
        );

        // Consume scan (atomic operation)
        const consumeResult = await consumeScan(user.id);
        if (!consumeResult.success) {
          throw new Error(consumeResult.reason || "Failed to consume scan");
        }

        console.log(`✅ Medical imaging SSE analysis completed`);

        // Use the unified result structure from the workflow
        const unifiedResult = workflowResult.medicalImagingAnalysis;

        console.log("🔬 SSE: Unified result from workflow:", {
          hasUnifiedResult: !!unifiedResult,
          unifiedResultKeys: unifiedResult ? Object.keys(unifiedResult) : [],
          unifiedResultType: typeof unifiedResult,
        });

        if (!unifiedResult) {
          console.warn(
            "⚠️ No unified result structure found in workflow result",
          );
          throw new Error(
            "Medical imaging analysis failed to produce unified result",
          );
        }

        // Format result using unified structure (matching unified workflow pattern)
        const result = {
          // Use unified result as base (contains all standard fields)
          ...unifiedResult,

          // Add medical imaging specific flags
          isMedicalImaging: true,

          // Include standard document structure fields (without base64 data to avoid URL length issues)
          pages: data.images.map((_: string, index: number) => ({
            page: index + 1,
            text: "", // Medical images don't have meaningful text
            image: `medical-image-${index + 1}`, // Reference only, base64 data stays in client memory
            thumbnail: `medical-thumbnail-${index + 1}`, // Reference only
          })),
          documents: [
            {
              title: dicomMetadata?.studyDescription || "Medical Imaging Study",
              date:
                dicomMetadata?.studyDate ||
                new Date().toISOString().split("T")[0],
              language: language.toLowerCase(),
              isMedical: true,
              isMedicalImaging: true,
              pages: data.images.map((_: string, index: number) => index + 1),
            },
          ],

          metadata: {
            processingType: "medical_imaging",
            isDicomExtracted,
            dicomMetadata,
            analysisTimestamp: new Date().toISOString(),
            workflowVersion: "2.0",
            nodesExecuted: [
              "patient_performer_detection",
              "medical_imaging_analysis",
            ],
          },
        };

        // Send completion event with the result
        sendEvent({
          type: "complete",
          stage: "completed",
          progress: 100,
          message: "Medical imaging analysis completed successfully",
          data: result,
          timestamp: Date.now(),
        });

        controller.close();
      } catch (err) {
        log.sse.error("Medical imaging analysis stream error:", err);

        sendEvent({
          type: "error",
          stage: "error",
          progress: 0,
          message:
            err instanceof Error
              ? err.message
              : "Unknown error occurred during medical imaging analysis",
          timestamp: Date.now(),
        });

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
