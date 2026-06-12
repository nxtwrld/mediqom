import type { ImportJob, FileManifestEntry } from "./types";
import type { Task } from "./index";
import {
  addJob,
  replaceJob,
  updateJob,
  removeJob,
  importJobs,
  addError,
  formatImportError,
} from "./job-store";
import { cacheFiles, clearFiles, hasFiles } from "./file-cache";
import type { SSEProgressEvent } from "./sse-client";
import { apiFetch } from "$lib/api/client";
import { isNativePlatform } from "$lib/config/platform";
import { get } from "svelte/store";
import { profile } from "$lib/profiles";
import { buildCarePlanContextForProfile } from "$lib/careplan/store";

const POLL_INTERVAL_MS = 3000;

/** Track active AbortControllers so deleteJob() can cancel in-flight processing */
const activeControllers = new Map<string, AbortController>();

/** Create a new import job from preprocessed tasks */
export async function createJob(
  tasks: Task[],
  originalFiles: File[],
  language: string,
  placeholderId?: string,
): Promise<ImportJob> {
  // Build file manifest from tasks
  const files: FileManifestEntry[] = tasks.map((task) => ({
    name: task.title,
    type: task.files[0]?.type || "application/octet-stream",
    size: task.files[0]?.size || 0,
    taskType: task.type,
    processedImages: Array.isArray(task.data)
      ? (task.data as string[])
      : typeof task.data === "string"
        ? [task.data as string]
        : [],
    dicomMetadata: task.dicomMetadata,
    thumbnail: task.thumbnail,
    layoutDetections: task.layoutDetections || [],
  }));

  // Create job on server
  const response = await apiFetch("/v1/import/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files, language }),
  });

  if (!response.ok) {
    const err = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    throw new Error(err.message || "Failed to create import job");
  }

  const { id: jobId } = await response.json();

  // Cache original files in IndexedDB
  await cacheFiles(jobId, originalFiles);

  // Add to store with initial state
  const job: ImportJob = {
    id: jobId,
    user_id: "",
    status: "created",
    stage: null,
    progress: 0,
    message: null,
    error: null,
    scan_deducted: false,
    processing_started_at: null,
    file_count: files.length,
    file_manifest: files,
    language,
    extraction_result: null,
    analysis_results: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  if (!placeholderId) {
    addJob(job);
  }
  // When placeholderId provided, caller handles store update (for stable key mapping)
  return job;
}

/** Update layout detections for a job after async detection completes */
export async function updateLayoutDetections(
  jobId: string,
  tasks: Task[],
): Promise<void> {
  const layoutDetections: {
    fileIndex: number;
    detections: any[];
  }[] = [];

  tasks.forEach((task, i) => {
    if (task.layoutDetections && task.layoutDetections.length > 0) {
      layoutDetections.push({
        fileIndex: i,
        detections: task.layoutDetections,
      });
    }
  });

  if (layoutDetections.length === 0) return;

  try {
    const response = await apiFetch(`/v1/import/jobs/${jobId}/layout`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layoutDetections }),
    });

    if (!response.ok) {
      console.warn("[LayoutDetection] Failed to update job layout detections:", response.statusText);
    } else {
      console.log(`[LayoutDetection] Updated ${layoutDetections.length} file(s) for job ${jobId}`);
    }
  } catch (err) {
    console.warn("[LayoutDetection] Failed to send layout detections:", err);
  }
}

/** Process a job via SSE with polling fallback (web), or polling-only (Capacitor) */
export async function processJob(
  jobId: string,
  onProgress?: (event: SSEProgressEvent) => void,
  carePlanContext?: unknown,
): Promise<ImportJob> {
  const controller = new AbortController();
  activeControllers.set(jobId, controller);
  const { signal } = controller;

  // Care Plan context blob travels in the request body (never persisted server
  // side); empty body when there is no plan yet — Care Plan build row 7c. When
  // not supplied explicitly, build it from the currently active profile (the
  // merge defensively validates every link id, so a wrong-profile guess is
  // harmless — see CAREPLAN.md conflict C3).
  let ctx = carePlanContext;
  if (ctx === undefined) {
    try {
      const activeProfile = get(profile) as { id?: string } | null;
      if (activeProfile?.id) {
        ctx = (await buildCarePlanContextForProfile(activeProfile.id)) ?? undefined;
      }
    } catch {
      ctx = undefined;
    }
  }
  const processBody = JSON.stringify(ctx ? { carePlanContext: ctx } : {});

  const cleanup = () => { activeControllers.delete(jobId); };

  try {
    // On Capacitor: fire-and-forget the process endpoint, then poll
    if (isNativePlatform()) {
      // Trigger server processing — server continues even if we don't read the body
      await apiFetch(`/v1/import/jobs/${jobId}/process`, {
        method: "POST",
        timeout: 0,
        headers: {
          "Content-Type": "application/json",
          "X-Layout-Detection": "server",
        },
        body: processBody,
      }).catch(() => null);

      // 409 = already processing (server concurrency guard) — just poll
      // Any other error we still poll; polling will surface the real status
      const job = await pollUntilDone(jobId, onProgress, signal);
      cleanup();
      return job;
    }

    // Web: SSE with polling fallback
    const job = await new Promise<ImportJob>((resolve, reject) => {
      let resolved = false;

      // If already aborted, bail immediately
      if (signal.aborted) {
        resolved = true;
        reject(signal.reason || new DOMException("Aborted", "AbortError"));
        return;
      }

      signal.addEventListener("abort", () => {
        if (!resolved) {
          resolved = true;
          reject(signal.reason || new DOMException("Aborted", "AbortError"));
        }
      });

      const finishWithPoll = async () => {
        try {
          const job = await pollUntilDone(jobId, onProgress, signal);
          if (!resolved) {
            resolved = true;
            resolve(job);
          }
        } catch (err) {
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        }
      };

      // Start SSE request
      apiFetch(`/v1/import/jobs/${jobId}/process`, {
        method: "POST",
        timeout: 0,
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "X-Layout-Detection": "client",
        },
        body: processBody,
      })
        .then(async (response) => {
          if (signal.aborted) return;

          if (!response.ok) {
            // If 409 (already processing), fall back to polling
            if (response.status === 409) {
              return finishWithPoll();
            }
            const err = await response
              .json()
              .catch(() => ({ message: response.statusText }));
            throw new Error(err.message || "Failed to start processing");
          }

          if (!response.body) {
            return finishWithPoll();
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          const readStream = async (): Promise<void> => {
            try {
              if (signal.aborted) {
                await reader.cancel();
                return;
              }

              const { done, value } = await reader.read();
              if (done) return;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const eventData: SSEProgressEvent = JSON.parse(line.slice(6));

                    // Update store
                    updateJob(jobId, {
                      stage: eventData.stage,
                      progress: eventData.progress,
                      message: eventData.message,
                      status:
                        eventData.type === "complete"
                          ? "completed"
                          : eventData.type === "error"
                            ? "error"
                            : undefined,
                    } as any);

                    onProgress?.(eventData);

                    if (eventData.type === "complete") {
                      if (!resolved) {
                        resolved = true;
                        // Fetch final job from server
                        const job = await fetchJob(jobId);
                        if (job) {
                          addJob(job);
                          resolve(job);
                        } else {
                          resolve(eventData.data);
                        }
                      }
                      return;
                    }

                    if (eventData.type === "error") {
                      addError(
                        formatImportError(eventData.message),
                        jobId,
                      );
                      if (!resolved) {
                        resolved = true;
                        reject(new Error(eventData.message));
                      }
                      return;
                    }
                  } catch {
                    // Skip unparseable lines
                  }
                }
              }

              await readStream();
            } catch {
              // Stream error - fall back to polling
              if (!resolved) {
                await finishWithPoll();
              }
            }
          };

          await readStream();

          // Stream ended without complete/error event (e.g. network drop, app backgrounded)
          if (!resolved) {
            await finishWithPoll();
          }
        })
        .catch(async () => {
          // Fetch/network error - fall back to polling
          if (!resolved) {
            await finishWithPoll();
          }
        });
    });

    cleanup();
    return job;
  } catch (err) {
    cleanup();
    throw err;
  }
}

/** Poll job status until completion */
async function pollUntilDone(
  jobId: string,
  onProgress?: (event: SSEProgressEvent) => void,
  signal?: AbortSignal,
): Promise<ImportJob> {
  return new Promise((resolve, reject) => {
    let settled = false;

    // Listen for abort to stop polling
    signal?.addEventListener("abort", () => {
      if (!settled) {
        settled = true;
        reject(signal.reason || new DOMException("Aborted", "AbortError"));
      }
    });

    const poll = async () => {
      if (settled || signal?.aborted) return;

      try {
        const job = await fetchJob(jobId);
        if (settled || signal?.aborted) return;

        if (!job) {
          settled = true;
          reject(new Error("Job not found"));
          return;
        }

        addJob(job);

        onProgress?.({
          type:
            job.status === "completed"
              ? "complete"
              : job.status === "error"
                ? "error"
                : "progress",
          stage: job.stage || "",
          progress: job.progress,
          message: job.message || "",
          timestamp: Date.now(),
        });

        if (job.status === "completed") {
          settled = true;
          resolve(job);
          return;
        }
        if (job.status === "error") {
          addError(
            formatImportError(job.error || "Processing failed"),
            jobId,
          );
          settled = true;
          reject(new Error(job.error || "Processing failed"));
          return;
        }

        // Continue polling
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (settled || signal?.aborted) return;
        addError(formatImportError(err as Error), jobId);
        settled = true;
        reject(err);
      }
    };

    poll();
  });
}

/** Fetch a single job from the server */
export async function fetchJob(jobId: string): Promise<ImportJob | null> {
  const response = await apiFetch(`/v1/import/jobs/${jobId}`);
  if (!response.ok) return null;
  const { job } = await response.json();
  return job;
}

/** Check for pending jobs on app load/resume */
export async function checkPendingJobs(): Promise<ImportJob[]> {
  try {
    const response = await apiFetch("/v1/import/jobs");
    if (!response.ok) return [];

    const { jobs } = await response.json();
    if (!jobs || jobs.length === 0) return [];

    // Check local file cache availability for each job
    const enrichedJobs = await Promise.all(
      jobs.map(async (job: ImportJob) => {
        const hasCachedFiles = await hasFiles(job.id);
        return { ...job, _hasCachedFiles: hasCachedFiles };
      }),
    );

    // Merge with existing store (preserve current-session jobs not on server)
    importJobs.update((current) => {
      const serverIds = new Set(enrichedJobs.map((j: ImportJob) => j.id));
      const kept = current.filter((j) => !serverIds.has(j.id));
      return [...kept, ...enrichedJobs];
    });
    return enrichedJobs;
  } catch {
    return [];
  }
}

/** Delete a job and clean up cached files */
export async function deleteJob(jobId: string): Promise<void> {
  // Abort any in-flight processing before removing
  activeControllers.get(jobId)?.abort();
  activeControllers.delete(jobId);

  removeJob(jobId);
  await clearFiles(jobId);
  await apiFetch(`/v1/import/jobs/${jobId}`, { method: "DELETE" }).catch(
    (e) => console.warn('[Import] Failed to delete job from server:', e)
  );
}

/** Retry a failed job */
export async function retryJob(jobId: string): Promise<void> {
  const response = await apiFetch(`/v1/import/jobs/${jobId}`, {
    method: "PATCH",
  });
  if (!response.ok) {
    throw new Error("Failed to retry job");
  }
  updateJob(jobId, { status: "created", error: null, progress: 0 });
}
