import { error, type RequestHandler } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import assess from "$lib/import.server/assessInputs";
import { runDocumentProcessingWorkflow } from "$lib/langgraph/workflows/document-processing";
import { convertWorkflowResult } from "$lib/import.server/convertWorkflowResult";
import {
  loadSubscription,
  updateSubscription,
} from "$lib/user/subscriptions.server.js";
import type { ImportJob, FileManifestEntry, ReportAnalysis } from "$lib/import/types";

interface ProgressEvent {
  type: "progress" | "complete" | "error";
  stage: string;
  progress: number;
  message: string;
  data?: any;
  timestamp: number;
}

const CONCURRENCY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function getServiceClient() {
  return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function updateJob(supabase: any, jobId: string, updates: Partial<ImportJob>) {
  const { error: dbError } = await supabase
    .from("import_jobs")
    .update(updates)
    .eq("id", jobId);

  if (dbError) {
    console.error("Failed to update import job:", dbError);
  }
}

export const POST: RequestHandler = async ({
  params,
  locals: { safeGetSession, user },
}) => {
  const { session } = await safeGetSession();
  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const supabase = getServiceClient();

  // Fetch the job
  const { data: job, error: fetchError } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !job) {
    error(404, { message: "Import job not found" });
  }

  if (job.status === "completed") {
    error(400, { message: "Job already completed" });
  }

  // Concurrency guard: reject if another process call is active
  if (job.processing_started_at) {
    const startedAt = new Date(job.processing_started_at).getTime();
    if (Date.now() - startedAt < CONCURRENCY_WINDOW_MS && job.status !== "error") {
      error(409, { message: "Job is already being processed" });
    }
  }

  // Mark processing started
  await updateJob(supabase, job.id, {
    processing_started_at: new Date().toISOString(),
    status: "extracting",
    stage: "initialization",
    progress: 0,
    error: null,
  } as any);

  // Create SSE stream - processing continues even if stream disconnects
  const stream = new ReadableStream({
    async start(controller) {
      let streamOpen = true;

      const sendEvent = (event: ProgressEvent) => {
        if (!streamOpen) return;
        try {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Stream closed - processing continues
          streamOpen = false;
        }
      };

      // Keepalive
      const keepalive = setInterval(() => {
        if (!streamOpen) {
          clearInterval(keepalive);
          return;
        }
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch {
          streamOpen = false;
          clearInterval(keepalive);
        }
      }, 30000);

      try {
        const fileManifest: FileManifestEntry[] = job.file_manifest || [];

        // ---- STAGE 1: Extraction ----
        let extractionResults = job.extraction_result || [];
        const needsExtraction = extractionResults.length < fileManifest.length;

        if (needsExtraction) {
          sendEvent({
            type: "progress",
            stage: "extraction",
            progress: 5,
            message: "Starting document extraction...",
            timestamp: Date.now(),
          });

          await updateJob(supabase, job.id, {
            status: "extracting",
            stage: "extraction",
            progress: 5,
          } as any);

          for (let i = extractionResults.length; i < fileManifest.length; i++) {
            const file = fileManifest[i];
            const fileProgress = Math.round(5 + ((i / fileManifest.length) * 25));

            sendEvent({
              type: "progress",
              stage: "extraction",
              progress: fileProgress,
              message: `Extracting file ${i + 1} of ${fileManifest.length}: ${file.name}`,
              timestamp: Date.now(),
            });

            await updateJob(supabase, job.id, {
              stage: "extraction",
              progress: fileProgress,
              message: `Extracting ${file.name}`,
            } as any);

            // Run extraction using assess() with images from file manifest
            const assessResult = await assess(
              { images: file.processedImages },
              (stage, progress, message) => {
                sendEvent({
                  type: "progress",
                  stage: `extraction_${stage}`,
                  progress: Math.round(5 + ((i + progress / 100) / fileManifest.length) * 25),
                  message,
                  timestamp: Date.now(),
                });
              },
            );

            extractionResults.push(assessResult);

            // Persist after each file
            await updateJob(supabase, job.id, {
              extraction_result: extractionResults,
              progress: Math.round(5 + (((i + 1) / fileManifest.length) * 25)),
            } as any);
          }

          // Deduct scan (once per job)
          if (!job.scan_deducted) {
            const subscription = await loadSubscription(user.id);
            if (subscription && subscription.scans > 0) {
              subscription.scans -= 1;
              await updateSubscription(subscription, user.id);
              await updateJob(supabase, job.id, {
                scan_deducted: true,
              } as any);
            }
          }
        }

        // ---- STAGE 2: Analysis ----
        sendEvent({
          type: "progress",
          stage: "analysis",
          progress: 30,
          message: "Starting medical document analysis...",
          timestamp: Date.now(),
        });

        await updateJob(supabase, job.id, {
          status: "analyzing",
          stage: "analysis",
          progress: 30,
        } as any);

        let analysisResults: ReportAnalysis[] = job.analysis_results || [];

        // Build flat list of documents to analyze
        const allDocuments: { assessmentIndex: number; docIndex: number; text: string; title: string }[] = [];
        for (let ai = 0; ai < extractionResults.length; ai++) {
          const assessment = extractionResults[ai];
          for (let di = 0; di < assessment.documents.length; di++) {
            const doc = assessment.documents[di];
            const documentText = assessment.pages
              .filter((p: any) => doc.pages.includes(p.page))
              .map((p: any) => p.text)
              .join("\n");
            allDocuments.push({
              assessmentIndex: ai,
              docIndex: di,
              text: documentText,
              title: doc.title || `Document ${ai + 1}-${di + 1}`,
            });
          }
        }

        // Resume: skip already-analyzed documents
        const startFrom = analysisResults.length;

        for (let i = startFrom; i < allDocuments.length; i++) {
          const doc = allDocuments[i];
          const docProgress = Math.round(30 + ((i / allDocuments.length) * 65));

          sendEvent({
            type: "progress",
            stage: "analysis",
            progress: docProgress,
            message: `Analyzing document ${i + 1} of ${allDocuments.length}: ${doc.title}`,
            timestamp: Date.now(),
          });

          await updateJob(supabase, job.id, {
            stage: "analysis",
            progress: docProgress,
            message: `Analyzing ${doc.title}`,
          } as any);

          // Run LangGraph workflow
          const workflowResult = await runDocumentProcessingWorkflow(
            [], // images not needed for text analysis
            doc.text,
            job.language,
            {
              useEnhancedSignals: true,
              enableExternalValidation: false,
              streamResults: true,
            },
            (event: any) => {
              sendEvent({
                type: "progress",
                stage: `analysis_${event.stage || "processing"}`,
                progress: Math.round(30 + ((i + (event.progress || 0) / 100) / allDocuments.length) * 65),
                message: event.message || `Processing ${doc.title}...`,
                timestamp: Date.now(),
              });
            },
          );

          const result = convertWorkflowResult(workflowResult, doc.text);
          analysisResults.push(result);

          // Persist after each document
          await updateJob(supabase, job.id, {
            analysis_results: analysisResults,
            progress: Math.round(30 + (((i + 1) / allDocuments.length) * 65)),
          } as any);
        }

        // ---- COMPLETE ----
        // Extend TTL to 7 days for completed jobs
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        await updateJob(supabase, job.id, {
          status: "completed",
          stage: "completed",
          progress: 100,
          message: "Processing completed",
          expires_at: expiresAt,
        } as any);

        sendEvent({
          type: "complete",
          stage: "completed",
          progress: 100,
          message: "Import processing completed successfully",
          data: {
            extraction_result: extractionResults,
            analysis_results: analysisResults,
          },
          timestamp: Date.now(),
        });

        clearInterval(keepalive);
        if (streamOpen) {
          controller.close();
        }
      } catch (err) {
        console.error("Import job processing error:", err);

        const errorMessage =
          err instanceof Error ? err.message : "Unknown error during processing";

        // Persist error to DB (processing survives stream death)
        await updateJob(supabase, job.id, {
          status: "error",
          error: errorMessage,
          stage: "error",
          progress: 0,
        } as any);

        sendEvent({
          type: "error",
          stage: "error",
          progress: 0,
          message: errorMessage,
          timestamp: Date.now(),
        });

        clearInterval(keepalive);
        if (streamOpen) {
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
