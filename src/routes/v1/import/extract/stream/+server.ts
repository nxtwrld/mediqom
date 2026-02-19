import { error, type RequestHandler } from "@sveltejs/kit";
import assess from "$lib/import.server/assessInputs";
import {
  checkScansAvailable,
  consumeScan,
} from "$lib/billing/subscription.server";
import { DEBUG_EXTRACTOR } from "$env/static/private";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { sleep } from "$lib/utils";

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

  if (data.images === undefined && data.text === undefined) {
    error(400, { message: "No image or text provided" });
  }

  // Create SSE stream for real-time progress
  const stream = new ReadableStream({
    async start(controller) {
      console.log("📡 SSE extract stream started");

      // Set up keepalive interval to prevent connection drops
      const keepaliveInterval = setInterval(() => {
        try {
          // Send a keepalive comment every 30 seconds
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch (err) {
          // Connection closed, stop keepalive
          clearInterval(keepaliveInterval);
        }
      }, 30000);

      const sendEvent = (event: ProgressEvent) => {
        const message = `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(new TextEncoder().encode(message));
        } catch (err) {
          console.error("Error sending SSE event:", err);
          clearInterval(keepaliveInterval);
        }
      };

      try {
        // Send initial progress
        sendEvent({
          type: "progress",
          stage: "initialization",
          progress: 0,
          message: "Starting document extraction...",
          timestamp: Date.now(),
        });

        // Send image processing progress
        sendEvent({
          type: "progress",
          stage: "image_processing",
          progress: 25,
          message: `Processing ${data.images?.length || 0} images...`,
          timestamp: Date.now(),
        });

        // Send OCR progress
        sendEvent({
          type: "progress",
          stage: "ocr_extraction",
          progress: 50,
          message: "Extracting text from images...",
          timestamp: Date.now(),
        });

        // Handle debug/testing mode for extraction

        let result;

        if (DEBUG_EXTRACTOR && DEBUG_EXTRACTOR !== "false") {
          if (DEBUG_EXTRACTOR === "true") {
            // Save mode: Run real extraction and save results to file
            sendEvent({
              type: "progress",
              stage: "ocr_extraction",
              progress: 60,
              message: "Running extraction and saving test data...",
              timestamp: Date.now(),
            });

            result = await assess(data);

            // Save the result to a timestamped file
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `extraction-result-${timestamp}.json`;
            const filepath = join(
              process.cwd(),
              "test-data",
              "extractions",
              filename,
            );

            try {
              // Ensure directory exists
              const { mkdirSync } = await import("fs");
              mkdirSync(join(process.cwd(), "test-data", "extractions"), {
                recursive: true,
              });

              // Save with metadata
              const testData = {
                timestamp: new Date().toISOString(),
                input: {
                  imagesCount: data.images?.length || 0,
                  hasText: !!data.text,
                  language: data.language,
                },
                result: result,
              };

              writeFileSync(filepath, JSON.stringify(testData, null, 2));
              console.log(`📁 Extraction test data saved to: ${filepath}`);

              sendEvent({
                type: "progress",
                stage: "test_data_saved",
                progress: 70,
                message: `Test data saved to: ${filename}`,
                timestamp: Date.now(),
              });
            } catch (saveError) {
              console.error("Failed to save test data:", saveError);
            }
          } else {
            // Load mode: Load results from specified file
            const filepath = DEBUG_EXTRACTOR.startsWith("/")
              ? DEBUG_EXTRACTOR
              : join(process.cwd(), DEBUG_EXTRACTOR);

            sendEvent({
              type: "progress",
              stage: "loading_test_data",
              progress: 60,
              message: `Loading test data from: ${DEBUG_EXTRACTOR}`,
              timestamp: Date.now(),
            });

            if (existsSync(filepath)) {
              try {
                const testData = JSON.parse(readFileSync(filepath, "utf8"));
                result = testData.result || testData; // Handle both wrapped and raw formats

                // Simulate processing time for realistic testing
                await sleep(1500);

                sendEvent({
                  type: "progress",
                  stage: "test_data_loaded",
                  progress: 70,
                  message: `Test data loaded successfully from ${DEBUG_EXTRACTOR}`,
                  timestamp: Date.now(),
                });

                console.log(`📁 Using test extraction data from: ${filepath}`);
              } catch (loadError) {
                console.error("Failed to load test data:", loadError);
                error(500, {
                  message: `Failed to load test data from ${DEBUG_EXTRACTOR}`,
                });
              }
            } else {
              error(404, {
                message: `Test data file not found: ${DEBUG_EXTRACTOR}`,
              });
            }
          }
        } else {
          // Normal mode: Perform the actual assessment with progress callback
          result = await assess(data, (stage, progress, message) => {
            sendEvent({
              type: "progress",
              stage,
              progress,
              message,
              timestamp: Date.now(),
            });
          });
        }

        // Send document splitting progress
        sendEvent({
          type: "progress",
          stage: "document_splitting",
          progress: 75,
          message: `Identified ${result.documents.length} documents across ${result.pages.length} pages`,
          timestamp: Date.now(),
        });

        // Consume scan (atomic operation)
        const consumeResult = await consumeScan(user.id);
        if (!consumeResult.success) {
          throw new Error(consumeResult.reason || "Failed to consume scan");
        }

        // Send completion
        sendEvent({
          type: "complete",
          stage: "completed",
          progress: 100,
          message: "Document extraction completed successfully",
          data: result,
          timestamp: Date.now(),
        });

        clearInterval(keepaliveInterval);
        controller.close();
      } catch (err) {
        console.error("Extract stream error:", err);

        sendEvent({
          type: "error",
          stage: "error",
          progress: 0,
          message:
            err instanceof Error ? err.message : "Unknown error occurred",
          timestamp: Date.now(),
        });

        clearInterval(keepaliveInterval);
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
