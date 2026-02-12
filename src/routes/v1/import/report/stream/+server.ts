import { error, type RequestHandler } from "@sveltejs/kit";
import { runDocumentProcessingWorkflow } from "$lib/langgraph/workflows/document-processing";
import { log } from "$lib/logging/logger";
import { isSSEProgressDebuggingEnabled } from "$lib/config/logging-config";
import { convertWorkflowResult } from "$lib/import.server/convertWorkflowResult";

interface ProgressEvent {
  type: "progress" | "complete" | "error";
  stage: string;
  progress: number;
  message: string;
  data?: any;
  timestamp: number;
}

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  if (data.images === undefined && data.text === undefined) {
    error(400, { message: "No image or text provided" });
  }

  // Create SSE stream for real-time progress
  const stream = new ReadableStream({
    async start(controller) {
      log.sse.info("SSE report analysis stream started", {
        hasImages: !!data.images,
        hasText: !!data.text,
        language: data.language,
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
        // Send initial progress - continue from extraction phase
        sendEvent({
          type: "progress",
          stage: "analysis_initialization",
          progress: 30, // Continue from where extraction left off
          message: "Starting medical document analysis...",
          data: { phase: "analysis" },
          timestamp: Date.now(),
        });

        // Use LangGraph workflow with real progress events
        const workflowResult = await runDocumentProcessingWorkflow(
          data.images,
          data.text,
          data.language,
          {
            useEnhancedSignals: true,
            enableExternalValidation: false, // Will be enabled in Phase 3
            streamResults: true,
          },
          sendEvent, // Pass the progress callback
        );

        // Convert LangGraph workflow result to ReportAnalysis format
        const result = convertWorkflowResult(workflowResult, data.text);

        // Send completion event with the result
        sendEvent({
          type: "complete",
          stage: "completed",
          progress: 100,
          message: "Medical document analysis completed successfully",
          data: result,
          timestamp: Date.now(),
        });

        controller.close();
      } catch (err) {
        log.sse.error("Report analysis stream error:", err);

        sendEvent({
          type: "error",
          stage: "error",
          progress: 0,
          message:
            err instanceof Error
              ? err.message
              : "Unknown error occurred during analysis",
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
