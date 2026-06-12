import { error, type RequestHandler } from "@sveltejs/kit";
import { checkRateLimit } from "$lib/auth/rate-limiter";
import { auditFromEvent } from "$lib/audit/index.server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import assess, {
  assessOCR,
  assessImages,
  assessDocuments,
  assembleAssessment,
  type OcrResult,
} from "$lib/import.server/assessInputs";
import { runDocumentProcessingWorkflow } from "$lib/langgraph/workflows/document-processing";
import { convertWorkflowResult } from "$lib/import.server/convertWorkflowResult";
import { processMedicalImaging } from "$lib/langgraph/workflows/medical-imaging-workflow";
import type { MedicalImagingState } from "$lib/langgraph/state-medical-imaging";
import { consumeScan } from "$lib/billing/subscription.server";
import type {
  ImportJob,
  FileManifestEntry,
  ReportAnalysis,
} from "$lib/import/types";
import {
  prepareKey,
  exportKey,
  encrypt as encryptAES,
} from "$lib/encryption/aes";
import { wrapKey } from "$lib/encryption/keys";
import {
  saveExtractionResults,
  saveAnalysisResults,
  saveDocumentWorkflow,
  saveCompleteWorkflow,
  saveImportPhaseLog,
} from "$lib/import.server/debug-output";

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

async function updateJob(
  supabase: any,
  jobId: string,
  updates: Partial<ImportJob>,
) {
  const { error: dbError } = await supabase
    .from("import_jobs")
    .update(updates)
    .eq("id", jobId);

  if (dbError) {
    console.error("Failed to update import job:", dbError);
  }
}

/**
 * Retrieve user's public keys (RSA + optional KEM) for wrapping job encryption key.
 * Returns null if user doesn't have encryption keys set up yet.
 */
async function getUserPublicKeys(
  supabase: any,
  userId: string,
): Promise<{ publicKey: string; kemPublicKey: string | null } | null> {
  // Fetch RSA public key from private_keys, KEM public key from profiles
  const [pkResult, profileResult] = await Promise.all([
    supabase
      .from("private_keys")
      .select("public_key")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("profiles")
      .select("kem_public_key")
      .eq("auth_id", userId)
      .single(),
  ]);

  if (pkResult.error || !pkResult.data) {
    console.warn(
      "User public key not found - encryption will be skipped:",
      userId,
    );
    return null;
  }

  return {
    publicKey: pkResult.data.public_key,
    kemPublicKey: profileResult.data?.kem_public_key ?? null,
  };
}

export const POST: RequestHandler = async (event) => {
  const {
    params,
    request,
    locals: { safeGetSession, user },
  } = event;
  const { session } = await safeGetSession();
  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  // Rate limit: 10 requests/min per user
  const rl = checkRateLimit("import-process", user.id, 10, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs! / 1000)) },
    });
  }

  const supabase = getServiceClient();

  // Atomic claim: fetch + concurrency guard + mark started in one DB call (TOCTOU-safe)
  const { data: claimedJob, error: claimError } = await supabase
    .rpc('claim_import_job', {
      p_job_id: params.id,
      p_user_id: user.id,
      p_window_ms: CONCURRENCY_WINDOW_MS,
    })
    .single();

  if (claimError || !claimedJob) {
    error(409, { message: "Job not found, already completed, or being processed" });
  }

  const job = claimedJob as unknown as ImportJob;

  auditFromEvent(event, { action: "process", resource_type: "import_job", resource_id: params.id, metadata: { file_count: (job.file_manifest || []).length } });

  // Check if client will handle layout detection (ONNX)
  // Mobile/Capacitor clients don't read SSE, so they can't run client-side ONNX
  const clientHandlesLayout = request.headers.get("X-Layout-Detection") === "client";

  // Care Plan extraction context (build row 7c). Travels in the request body,
  // held in memory for this dispatch only, NEVER persisted. Capped to bound
  // prompt size; malformed bodies are ignored (extraction proceeds without it).
  let carePlanContext: unknown;
  try {
    const raw = await request.text();
    if (raw && raw.length <= 32_768) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.carePlanContext) {
        carePlanContext = parsed.carePlanContext;
      }
    }
  } catch {
    carePlanContext = undefined;
  }

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
        // Check if user has encryption keys set up
        const userKeys = await getUserPublicKeys(supabase, user.id);
        const useEncryption = userKeys !== null;

        // Generate job-specific encryption key if encryption is available
        // Note: With encryption enabled, job resume is not supported (would require
        // client-side decryption). Jobs are processed in one session with 1-hour TTL.
        let jobKey: CryptoKey | null = null;
        if (useEncryption) {
          jobKey = await prepareKey();
          const jobKeyExported = await exportKey(jobKey);
          const wrappedKey = await wrapKey(
            userKeys!.publicKey,
            userKeys!.kemPublicKey,
            jobKeyExported,
          );

          // Store wrapped key in job
          await updateJob(supabase, job.id, {
            result_encryption_key: wrappedKey,
          } as any);
          console.log(`[Import] Encryption enabled for job ${job.id}`);
        } else {
          console.warn(
            "Import job encryption disabled - user has no encryption keys",
          );
        }

        const fileManifest: FileManifestEntry[] = job.file_manifest || [];

        // ---- STAGE 1: Extraction ----
        let extractionResults: any[] = [];

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

        for (let i = 0; i < fileManifest.length; i++) {
          const file = fileManifest[i];
          const fileProgress = Math.round(5 + (i / fileManifest.length) * 25);

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

          if (file.taskType === "application/dicom" && file.dicomMetadata) {
            // Route DICOM files to specialized medical imaging workflow
            console.log(`[Import] DICOM routing: ${file.name}`);

            const imagingState: MedicalImagingState = {
              images: file.processedImages,
              language: job.language || "English",
              metadata: {
                isDicomExtracted: true,
                dicomMetadata: file.dicomMetadata,
                imageSource: "dicom",
              },
              content: [{
                type: "text" as const,
                text: `DICOM Context:\n- Modality: ${file.dicomMetadata.modality || "Unknown"}\n- Body Part: ${file.dicomMetadata.bodyPartExamined || "Unknown"}\n- Study: ${file.dicomMetadata.studyDescription || "Not specified"}`,
              }],
              imagingMetadata: {
                modality: file.dicomMetadata.modality || "Unknown",
                bodyPartExamined: file.dicomMetadata.bodyPartExamined || "Unknown",
                studyDescription: file.dicomMetadata.studyDescription,
                viewPosition: file.dicomMetadata.viewPosition || "Unknown",
                studyDate: file.dicomMetadata.studyDate,
                isDicomExtracted: true,
              },
              detectedBodyParts: [],
              detectedAnomalies: [],
              measurements: [],
              urgentFindings: false,
              tokenUsage: { total: 0 },
            };

            let lastDicomDbProgress = fileProgress;
            const workflowResult = await processMedicalImaging(
              imagingState,
              undefined,
              (event) => {
                const mappedProgress = Math.round(
                  5 + ((i + (event.progress || 0) / 100) / fileManifest.length) * 25,
                );
                sendEvent({
                  type: "progress",
                  stage: `dicom_${event.stage}`,
                  progress: mappedProgress,
                  message: event.message || `Processing DICOM ${file.name}...`,
                  timestamp: Date.now(),
                });

                // Persist to DB for polling clients (throttled: >= 2% change)
                if (mappedProgress - lastDicomDbProgress >= 2) {
                  lastDicomDbProgress = mappedProgress;
                  updateJob(supabase, job.id, {
                    progress: mappedProgress,
                    message: event.message || `Processing DICOM ${file.name}...`,
                  } as any);
                }
              },
            );

            const unifiedResult = workflowResult.medicalImagingAnalysis;

            // Format as Assessment with full analysis (matching SSE endpoint output)
            const assessResult = {
              ...unifiedResult,
              isMedicalImaging: true,
              pages: file.processedImages.map((_: string, index: number) => ({
                page: index + 1,
                text: "",
                image: `medical-image-${index + 1}`,
                thumbnail: file.thumbnail || `medical-thumbnail-${index + 1}`,
              })),
              documents: [{
                title: file.dicomMetadata.studyDescription || "Medical Imaging Study",
                date: file.dicomMetadata.studyDate || new Date().toISOString().split("T")[0],
                language: (job.language || "english").toLowerCase(),
                isMedical: true,
                isMedicalImaging: true,
                pages: file.processedImages.map((_: string, index: number) => index + 1),
              }],
            };
            extractionResults.push(assessResult);
          } else {
            // ── Phased extraction: OCR → signal client → wait for ONNX → crop → classify ──

            let lastExtractDbProgress = fileProgress;
            const phaseProgress = (stage: string, progress: number, message: string) => {
              const mappedProgress = Math.round(
                5 + ((i + progress / 100) / fileManifest.length) * 25,
              );
              sendEvent({
                type: "progress",
                stage: `extraction_${stage}`,
                progress: mappedProgress,
                message,
                timestamp: Date.now(),
              });
              if (mappedProgress - lastExtractDbProgress >= 2) {
                lastExtractDbProgress = mappedProgress;
                updateJob(supabase, job.id, {
                  progress: mappedProgress,
                  message,
                } as any);
              }
            };

            // Phase 1: OCR
            const { ocrData, tokenUsage: ocrTokens } = await assessOCR(
              file.processedImages,
              phaseProgress,
            );

            // Identify pages with images
            const pagesWithImages = ocrData.pages
              .filter(p => p.hasImages)
              .map(p => p.page);

            console.log(
              `[Import] File ${i + 1}: OCR done, pagesWithImages=[${pagesWithImages.join(", ")}]`,
            );

            // Debug dump: OCR phase
            saveImportPhaseLog(job.id, i, "ocr", {
              pageCount: ocrData.pages.length,
              pagesWithImages,
              textLengths: ocrData.pages.map(p => ({ page: p.page, len: p.text.length })),
            });

            // Send ocr_complete SSE event so the client can run targeted ONNX
            sendEvent({
              type: "progress",
              stage: "ocr_complete",
              progress: Math.round(5 + ((i + 0.6) / fileManifest.length) * 25),
              message: "OCR complete, analyzing images...",
              data: {
                fileIndex: i,
                pagesWithImages,
              },
              timestamp: Date.now(),
            });

            // Phase 2: Wait for client ONNX detections if pages have images
            let layoutDetections = file.layoutDetections || [];

            if (pagesWithImages.length > 0 && layoutDetections.length === 0 && !clientHandlesLayout) {
              console.log(`[Import] File ${i + 1}: client does not handle layout detection — skipping wait, using LLM fallback`);
            }

            if (pagesWithImages.length > 0 && layoutDetections.length === 0 && clientHandlesLayout) {
              const MAX_WAIT_MS = 15_000;
              const POLL_MS = 2_000;
              const waitStart = Date.now();

              while (Date.now() - waitStart < MAX_WAIT_MS) {
                await new Promise(r => setTimeout(r, POLL_MS));

                try {
                  const { data: freshJob } = await supabase
                    .from("import_jobs")
                    .select("file_manifest")
                    .eq("id", job.id)
                    .single();

                  const fileDetections = freshJob?.file_manifest?.[i]?.layoutDetections;
                  if (fileDetections && fileDetections.length > 0) {
                    layoutDetections = fileDetections;
                    console.log(
                      `[Import] File ${i + 1}: ${layoutDetections.length} layout detection(s) after ${Math.round(Date.now() - waitStart)}ms`,
                    );
                    break;
                  }
                } catch {
                  // DB read failed — continue waiting
                }
              }

              if (layoutDetections.length === 0) {
                console.log(`[Import] File ${i + 1}: no layout detections after ${MAX_WAIT_MS}ms — LLM fallback`);
              }

              // Debug dump: layout wait result
              saveImportPhaseLog(job.id, i, "layout_wait", {
                pagesWithImages,
                received: layoutDetections.length,
                waitMs: Date.now() - waitStart,
              });
            }

            // Phase 2b: Image cropping (YOLO detections or LLM fallback)
            const { croppedImagesByPage, tokenUsage: imgTokens } = await assessImages(
              file.processedImages,
              ocrData,
              layoutDetections.length > 0 ? layoutDetections : undefined,
              phaseProgress,
            );

            // Phase 3: Document classification
            const { documents: assessmentDocuments, tokenUsage: docTokens } = await assessDocuments(
              ocrData,
              phaseProgress,
            );

            // Phase 4: Assemble
            const totalTokens = {
              total: ocrTokens.total + imgTokens.total + docTokens.total,
            };
            const assessResult = assembleAssessment(
              ocrData,
              croppedImagesByPage,
              assessmentDocuments,
              totalTokens,
            );

            extractionResults.push(assessResult);
          }

          // Persist after each file (with encryption if available)
          if (useEncryption && jobKey) {
            const encryptedExtraction = await encryptAES(
              jobKey,
              JSON.stringify(extractionResults),
            );
            await updateJob(supabase, job.id, {
              encrypted_extraction_result: encryptedExtraction,
              progress: Math.round(5 + ((i + 1) / fileManifest.length) * 25),
            } as any);
          } else {
            // Fallback to plaintext for users without encryption keys
            await updateJob(supabase, job.id, {
              extraction_result: extractionResults,
              progress: Math.round(5 + ((i + 1) / fileManifest.length) * 25),
            } as any);
          }
        }

        // Save extraction results for debugging
        saveExtractionResults(job.id, extractionResults);

        // Deduct scan (once per job, atomic operation)
        if (!job.scan_deducted) {
          const consumeResult = await consumeScan(user.id);
          if (consumeResult.success) {
            await updateJob(supabase, job.id, {
              scan_deducted: true,
            } as any);
          }
          // Note: If consumption fails, we continue processing but don't mark as deducted
          // This allows retry on next job processing attempt
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

        let analysisResults: ReportAnalysis[] = [];

        // Build flat list of documents to analyze
        const allDocuments: {
          assessmentIndex: number;
          docIndex: number;
          text: string;
          title: string;
          isPreAnalyzed: boolean;
          embeddedImages?: string[];
        }[] = [];
        for (let ai = 0; ai < extractionResults.length; ai++) {
          const assessment = extractionResults[ai];

          // DICOM assessments already contain full analysis from medical imaging workflow
          if (assessment.isMedicalImaging && assessment.report) {
            allDocuments.push({
              assessmentIndex: ai,
              docIndex: 0,
              text: "",
              title: assessment.documents?.[0]?.title || "Medical Imaging Study",
              isPreAnalyzed: true,
            });
            continue;
          }

          for (let di = 0; di < assessment.documents.length; di++) {
            const doc = assessment.documents[di];
            const docPages = assessment.pages.filter((p: any) =>
              doc.pages.includes(p.page),
            );
            const documentText = docPages
              .map((p: any) => p.text)
              .join("\n");

            // Collect embedded images from the document's pages
            const embeddedImages: string[] = [];
            for (const p of docPages) {
              if (p.images && Array.isArray(p.images)) {
                for (const img of p.images) {
                  if (img.data) {
                    embeddedImages.push(img.data);
                  }
                }
              }
            }

            allDocuments.push({
              assessmentIndex: ai,
              docIndex: di,
              text: documentText,
              title: doc.title || `Document ${ai + 1}-${di + 1}`,
              isPreAnalyzed: false,
              embeddedImages,
            });
          }
        }

        // Send document detection event
        sendEvent({
          type: "progress",
          stage: "documents_detected",
          progress: 30,
          message: `Detected ${allDocuments.length} document${allDocuments.length !== 1 ? "s" : ""}`,
          data: {
            documentCount: allDocuments.length,
            titles: allDocuments.map((d) => d.title),
          },
          timestamp: Date.now(),
        });

        // Parallel document analysis — all documents processed concurrently
        const progressPerDoc = 65 / allDocuments.length;

        const analysisPromises = allDocuments.map((doc, i) => {
          const docProgressBase = 30 + i * progressPerDoc;

          sendEvent({
            type: "progress",
            stage: `analysis_doc_${i + 1}`,
            progress: Math.round(docProgressBase),
            message: `Analyzing document ${i + 1} of ${allDocuments.length}: ${doc.title}`,
            timestamp: Date.now(),
          });

          // DICOM: assessment already contains full analysis from medical imaging workflow
          if (doc.isPreAnalyzed) {
            console.log(`[Import] Pre-analyzed DICOM: ${doc.title}`);
            return Promise.resolve({
              index: i,
              result: extractionResults[doc.assessmentIndex] as ReportAnalysis,
            });
          }

          // Run LangGraph workflow for regular documents
          let lastDocDbProgress = Math.round(docProgressBase);
          return runDocumentProcessingWorkflow(
            doc.embeddedImages || [], // pass embedded images from page crops
            doc.text,
            job.language,
            {
              useEnhancedSignals: true,
              enableExternalValidation: false,
              streamResults: true,
              jobId: job.id,
              carePlanContext,
            },
            (event: any) => {
              const mappedProgress = Math.round(
                docProgressBase +
                  ((event.progress || 0) / 100) * progressPerDoc,
              );
              sendEvent({
                type: "progress",
                stage: `analysis_doc_${i + 1}`,
                progress: mappedProgress,
                message: `[${doc.title}] ${event.message || "Processing..."}`,
                timestamp: Date.now(),
              });

              // Persist to DB for polling clients (throttled: >= 2% change)
              if (mappedProgress - lastDocDbProgress >= 2) {
                lastDocDbProgress = mappedProgress;
                updateJob(supabase, job.id, {
                  progress: mappedProgress,
                  message: `Analyzing ${doc.title}`,
                } as any);
              }
            },
          ).then((workflowResult) => {
            // Save individual document workflow for debugging
            saveDocumentWorkflow(job.id, i, workflowResult);

            const result = convertWorkflowResult(workflowResult, doc.text);

            // Warn about workflow errors (e.g. context length exceeded)
            if (result.errors && result.errors.length > 0) {
              console.warn(
                `[Import] Document "${doc.title}" had workflow errors:`,
                result.errors,
              );
              sendEvent({
                type: "progress",
                stage: `analysis_doc_${i + 1}`,
                progress: Math.round(docProgressBase + progressPerDoc),
                message: `Document "${doc.title}" analysis incomplete: ${result.errors.map((e: any) => e.error).join("; ")}`,
                timestamp: Date.now(),
              });
            }

            return { index: i, result };
          });
        });

        const analysisSettled = await Promise.all(analysisPromises);

        // Sort by original index and extract results
        analysisResults = analysisSettled
          .sort((a, b) => a.index - b.index)
          .map((r) => r.result);

        // Persist all results at once (with encryption if available)
        if (useEncryption && jobKey) {
          const encryptedAnalysis = await encryptAES(
            jobKey,
            JSON.stringify(analysisResults),
          );
          await updateJob(supabase, job.id, {
            encrypted_analysis_results: encryptedAnalysis,
            progress: 95,
          } as any);
        } else {
          await updateJob(supabase, job.id, {
            analysis_results: analysisResults,
            progress: 95,
          } as any);
        }

        // Save analysis results for debugging
        saveAnalysisResults(job.id, analysisResults);

        // ---- COMPLETE ----
        // TTL is managed by database trigger (1 hour for completed jobs)
        await updateJob(supabase, job.id, {
          status: "completed",
          stage: "completed",
          progress: 100,
          message: "Processing completed",
        } as any);

        // Save complete workflow state for debugging
        saveCompleteWorkflow(job.id, extractionResults, analysisResults, {
          jobId: job.id,
          status: "completed",
          timestamp: new Date().toISOString(),
        });

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
          err instanceof Error
            ? err.message
            : "Unknown error during processing";

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
