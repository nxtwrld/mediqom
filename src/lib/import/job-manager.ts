import type { ImportJob, FileManifestEntry } from "./types";
import type { Task } from "./index";
import { addJob, updateJob, removeJob, importJobs } from "./job-store";
import { cacheFiles, clearFiles, hasFiles } from "./file-cache";
import type { SSEProgressEvent } from "./sse-client";

const POLL_INTERVAL_MS = 3000;

/** Create a new import job from preprocessed tasks */
export async function createJob(
  tasks: Task[],
  originalFiles: File[],
  language: string,
): Promise<string> {
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
  }));

  // Create job on server
  const response = await fetch("/v1/import/jobs", {
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

  addJob(job);
  return jobId;
}

/** Process a job via SSE with polling fallback */
export async function processJob(
  jobId: string,
  onProgress?: (event: SSEProgressEvent) => void,
): Promise<ImportJob> {
  return new Promise((resolve, reject) => {
    let pollingTimer: ReturnType<typeof setInterval> | null = null;
    let resolved = false;

    const cleanup = () => {
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
    };

    const finishWithPoll = async () => {
      // SSE disconnected - fall back to polling
      cleanup();
      try {
        const job = await pollUntilDone(jobId, onProgress);
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
    fetch(`/v1/import/jobs/${jobId}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
    })
      .then(async (response) => {
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
                    cleanup();
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
                    cleanup();
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
      })
      .catch(async () => {
        // Fetch/network error - fall back to polling
        if (!resolved) {
          await finishWithPoll();
        }
      });
  });
}

/** Poll job status until completion */
async function pollUntilDone(
  jobId: string,
  onProgress?: (event: SSEProgressEvent) => void,
): Promise<ImportJob> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const job = await fetchJob(jobId);
        if (!job) {
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
          resolve(job);
          return;
        }
        if (job.status === "error") {
          reject(new Error(job.error || "Processing failed"));
          return;
        }

        // Continue polling
        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        reject(err);
      }
    };

    poll();
  });
}

/** Fetch a single job from the server */
export async function fetchJob(jobId: string): Promise<ImportJob | null> {
  const response = await fetch(`/v1/import/jobs/${jobId}`);
  if (!response.ok) return null;
  const { job } = await response.json();
  return job;
}

/** Check for pending jobs on app load/resume */
export async function checkPendingJobs(): Promise<ImportJob[]> {
  try {
    const response = await fetch("/v1/import/jobs");
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

    // Update store
    importJobs.set(enrichedJobs);
    return enrichedJobs;
  } catch {
    return [];
  }
}

/** Delete a job and clean up cached files */
export async function deleteJob(jobId: string): Promise<void> {
  await fetch(`/v1/import/jobs/${jobId}`, { method: "DELETE" });
  await clearFiles(jobId);
  removeJob(jobId);
}

/** Retry a failed job */
export async function retryJob(jobId: string): Promise<void> {
  const response = await fetch(`/v1/import/jobs/${jobId}`, {
    method: "PATCH",
  });
  if (!response.ok) {
    throw new Error("Failed to retry job");
  }
  updateJob(jobId, { status: "created", error: null, progress: 0 });
}
