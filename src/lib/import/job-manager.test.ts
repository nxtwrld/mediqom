import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ImportJob } from "./types";

// ---- Hoisted mock factories (required for vi.mock factories) ----
// NOTE: vi.hoisted runs before any imports, so we cannot use imported modules.
// We build a minimal writable-compatible store inline.

const {
  mockAddJob,
  mockReplaceJob,
  mockUpdateJob,
  mockRemoveJob,
  mockAddError,
  mockFormatImportError,
  mockImportJobs,
  mockCacheFiles,
  mockClearFiles,
  mockHasFiles,
  mockApiFetch,
  mockIsNativePlatform,
} = vi.hoisted(() => {
  // Minimal writable store that supports subscribe() and update()
  type Subscriber<T> = (v: T) => void;
  function makeWritable<T>(initial: T) {
    let value = initial;
    const subs = new Set<Subscriber<T>>();
    return {
      subscribe(cb: Subscriber<T>) {
        subs.add(cb);
        cb(value);
        return () => subs.delete(cb);
      },
      set(v: T) {
        value = v;
        subs.forEach((cb) => cb(v));
      },
      update(fn: (v: T) => T) {
        value = fn(value);
        subs.forEach((cb) => cb(value));
      },
      get current() {
        return value;
      },
    };
  }

  const mockImportJobs = makeWritable<any[]>([]);

  return {
    mockAddJob: vi.fn(),
    mockReplaceJob: vi.fn(),
    mockUpdateJob: vi.fn(),
    mockRemoveJob: vi.fn(),
    mockAddError: vi.fn(),
    mockFormatImportError: vi.fn((e: Error | string) =>
      typeof e === "string" ? e : e.message,
    ),
    mockImportJobs,
    mockCacheFiles: vi.fn(),
    mockClearFiles: vi.fn(),
    mockHasFiles: vi.fn(),
    mockApiFetch: vi.fn(),
    mockIsNativePlatform: vi.fn().mockReturnValue(false),
  };
});

vi.mock("./job-store", () => ({
  addJob: mockAddJob,
  replaceJob: mockReplaceJob,
  updateJob: mockUpdateJob,
  removeJob: mockRemoveJob,
  importJobs: mockImportJobs,
  addError: mockAddError,
  formatImportError: mockFormatImportError,
}));

vi.mock("./file-cache", () => ({
  cacheFiles: mockCacheFiles,
  clearFiles: mockClearFiles,
  hasFiles: mockHasFiles,
}));

vi.mock("$lib/api/client", () => ({
  apiFetch: mockApiFetch,
}));

vi.mock("$lib/config/platform", () => ({
  isNativePlatform: mockIsNativePlatform,
}));

// Import after mocks
import {
  createJob,
  updateLayoutDetections,
  fetchJob,
  checkPendingJobs,
  deleteJob,
  retryJob,
  processJob,
} from "./job-manager";
import type { Task } from "./index";
import { TaskState } from "./index";

// ---- Helpers ----

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    title: "test.pdf",
    type: "application/pdf",
    icon: "pdf",
    data: ["base64img"],
    state: TaskState.NEW,
    files: [new File(["content"], "test.pdf", { type: "application/pdf" })],
    ...overrides,
  };
}

function makeJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "job-123",
    user_id: "user-1",
    status: "created",
    stage: null,
    progress: 0,
    message: null,
    error: null,
    scan_deducted: false,
    processing_started_at: null,
    file_count: 1,
    file_manifest: [],
    language: "en",
    extraction_result: null,
    analysis_results: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue(body),
  };
}

function makeErrorResponse(status: number, statusText: string, body?: unknown) {
  return {
    ok: false,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body ?? { message: statusText }),
  };
}

// ---- Tests ----

describe("job-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNativePlatform.mockReturnValue(false);
    mockCacheFiles.mockResolvedValue(undefined);
    mockClearFiles.mockResolvedValue(undefined);
    mockHasFiles.mockResolvedValue(false);
    mockFormatImportError.mockImplementation((e: Error | string) =>
      typeof e === "string" ? e : e.message,
    );
  });

  // ============================================================
  // createJob
  // ============================================================

  describe("createJob", () => {
    it("creates a job via API and returns ImportJob with correct shape", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ id: "job-123" }));

      const tasks = [makeTask()];
      const files = [new File(["x"], "test.pdf")];
      const job = await createJob(tasks, files, "en");

      expect(job.id).toBe("job-123");
      expect(job.language).toBe("en");
      expect(job.status).toBe("created");
      expect(job.file_count).toBe(1);
      expect(job.progress).toBe(0);
    });

    it("posts to /v1/import/jobs with files manifest and language", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ id: "job-abc" }));

      const tasks = [makeTask({ title: "doc.pdf" })];
      await createJob(tasks, [], "de");

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/v1/import/jobs",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"language":"de"'),
        }),
      );
    });

    it("caches original files in IndexedDB after creation", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ id: "job-xyz" }));

      const files = [new File(["data"], "file.pdf")];
      await createJob([makeTask()], files, "en");

      expect(mockCacheFiles).toHaveBeenCalledWith("job-xyz", files);
    });

    it("calls addJob when no placeholderId provided", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ id: "job-1" }));

      await createJob([makeTask()], [], "en");

      expect(mockAddJob).toHaveBeenCalledOnce();
      expect(mockAddJob).toHaveBeenCalledWith(
        expect.objectContaining({ id: "job-1" }),
      );
    });

    it("does NOT call addJob when placeholderId is provided", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ id: "job-1" }));

      await createJob([makeTask()], [], "en", "placeholder-id");

      expect(mockAddJob).not.toHaveBeenCalled();
    });

    it("throws when API response is not ok", async () => {
      mockApiFetch.mockResolvedValue(
        makeErrorResponse(500, "Internal Server Error", {
          message: "Server exploded",
        }),
      );

      await expect(createJob([makeTask()], [], "en")).rejects.toThrow(
        "Server exploded",
      );
    });

    it("throws with statusText when error body has no message", async () => {
      const response = {
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: vi.fn().mockRejectedValue(new Error("not json")),
      };
      mockApiFetch.mockResolvedValue(response);

      await expect(createJob([makeTask()], [], "en")).rejects.toThrow(
        "Service Unavailable",
      );
    });

    it("builds file manifest with correct fields from task", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ id: "job-manifest" }));

      const task = makeTask({
        title: "xray.pdf",
        type: "application/pdf",
        data: ["img1", "img2"],
        thumbnail: "thumb",
        layoutDetections: [{ page: 1, detections: [] }],
      });

      await createJob([task], [], "en");

      const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
      expect(body.files[0]).toMatchObject({
        name: "xray.pdf",
        type: "application/pdf",
        taskType: "application/pdf",
        processedImages: ["img1", "img2"],
        thumbnail: "thumb",
        layoutDetections: [{ page: 1, detections: [] }],
      });
    });

    it("handles task.data as a plain string by wrapping in array", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ id: "job-str" }));

      const task = makeTask({ data: "single-base64" });
      await createJob([task], [], "en");

      const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
      expect(body.files[0].processedImages).toEqual(["single-base64"]);
    });

    it("handles task.data as ArrayBuffer by using empty array", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ id: "job-buf" }));

      const task = makeTask({ data: new ArrayBuffer(8) });
      await createJob([task], [], "en");

      const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
      expect(body.files[0].processedImages).toEqual([]);
    });

    it("uses default type/size when task has no files", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ id: "job-nf" }));

      const task = makeTask({ files: [] });
      await createJob([task], [], "en");

      const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
      expect(body.files[0].type).toBe("application/octet-stream");
      expect(body.files[0].size).toBe(0);
    });
  });

  // ============================================================
  // updateLayoutDetections
  // ============================================================

  describe("updateLayoutDetections", () => {
    it("does nothing when no task has layout detections", async () => {
      const tasks = [makeTask({ layoutDetections: [] })];

      await updateLayoutDetections("job-1", tasks);

      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it("patches the layout endpoint when tasks have detections", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({}));

      const tasks = [
        makeTask({ layoutDetections: [{ page: 1, detections: [{ class: "figure", confidence: 0.9, position: { x: 0, y: 0, width: 100, height: 100 } }] }] }),
        makeTask({ layoutDetections: [] }),
      ];

      await updateLayoutDetections("job-1", tasks);

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/v1/import/jobs/job-1/layout",
        expect.objectContaining({ method: "PATCH" }),
      );

      const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
      expect(body.layoutDetections).toHaveLength(1);
      expect(body.layoutDetections[0].fileIndex).toBe(0);
    });

    it("silently swallows errors from the layout patch", async () => {
      mockApiFetch.mockRejectedValue(new Error("network error"));

      const tasks = [
        makeTask({ layoutDetections: [{ page: 1, detections: [{ class: "text", confidence: 0.8, position: { x: 0, y: 0, width: 50, height: 50 } }] }] }),
      ];

      await expect(updateLayoutDetections("job-1", tasks)).resolves.toBeUndefined();
    });

    it("logs a warning when response is not ok but does not throw", async () => {
      mockApiFetch.mockResolvedValue(makeErrorResponse(400, "Bad Request"));

      const tasks = [
        makeTask({ layoutDetections: [{ page: 1, detections: [{ class: "table", confidence: 0.7, position: { x: 0, y: 0, width: 80, height: 60 } }] }] }),
      ];

      await expect(updateLayoutDetections("job-1", tasks)).resolves.toBeUndefined();
    });
  });

  // ============================================================
  // fetchJob
  // ============================================================

  describe("fetchJob", () => {
    it("returns the job on success", async () => {
      const job = makeJob({ id: "job-fetch" });
      mockApiFetch.mockResolvedValue(makeOkResponse({ job }));

      const result = await fetchJob("job-fetch");

      expect(result).toEqual(job);
      expect(mockApiFetch).toHaveBeenCalledWith("/v1/import/jobs/job-fetch");
    });

    it("returns null when response is not ok", async () => {
      mockApiFetch.mockResolvedValue(makeErrorResponse(404, "Not Found"));

      const result = await fetchJob("missing-job");

      expect(result).toBeNull();
    });

    it("propagates network errors", async () => {
      mockApiFetch.mockRejectedValue(new Error("network failure"));

      await expect(fetchJob("job-1")).rejects.toThrow("network failure");
    });
  });

  // ============================================================
  // checkPendingJobs
  // ============================================================

  describe("checkPendingJobs", () => {
    it("returns empty array when response is not ok", async () => {
      mockApiFetch.mockResolvedValue(makeErrorResponse(500, "Server Error"));

      const result = await checkPendingJobs();

      expect(result).toEqual([]);
    });

    it("returns empty array when jobs array is empty", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ jobs: [] }));

      const result = await checkPendingJobs();

      expect(result).toEqual([]);
    });

    it("returns empty array when jobs is null", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ jobs: null }));

      const result = await checkPendingJobs();

      expect(result).toEqual([]);
    });

    it("returns enriched jobs with _hasCachedFiles flag", async () => {
      const job1 = makeJob({ id: "j1" });
      const job2 = makeJob({ id: "j2" });

      mockApiFetch.mockResolvedValue(makeOkResponse({ jobs: [job1, job2] }));
      mockHasFiles.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const result = await checkPendingJobs();

      expect(result).toHaveLength(2);
      expect((result[0] as any)._hasCachedFiles).toBe(true);
      expect((result[1] as any)._hasCachedFiles).toBe(false);
    });

    it("calls hasFiles for each job", async () => {
      const jobs = [makeJob({ id: "j1" }), makeJob({ id: "j2" })];
      mockApiFetch.mockResolvedValue(makeOkResponse({ jobs }));
      mockHasFiles.mockResolvedValue(false);

      await checkPendingJobs();

      expect(mockHasFiles).toHaveBeenCalledTimes(2);
      expect(mockHasFiles).toHaveBeenCalledWith("j1");
      expect(mockHasFiles).toHaveBeenCalledWith("j2");
    });

    it("returns empty array on network error (silently)", async () => {
      mockApiFetch.mockRejectedValue(new Error("fetch failed"));

      const result = await checkPendingJobs();

      expect(result).toEqual([]);
    });

    it("fetches from /v1/import/jobs", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({ jobs: [] }));

      await checkPendingJobs();

      expect(mockApiFetch).toHaveBeenCalledWith("/v1/import/jobs");
    });

    it("updates the importJobs store merging server jobs with local", async () => {
      const serverJob = makeJob({ id: "server-job" });
      mockApiFetch.mockResolvedValue(makeOkResponse({ jobs: [serverJob] }));
      mockHasFiles.mockResolvedValue(false);

      // Pre-populate with a local-only job
      mockImportJobs.set([makeJob({ id: "local-only-job" })]);

      await checkPendingJobs();

      // Inspect the store's current value via our custom getter
      const storeValue = mockImportJobs.current;

      // Server job should be present; local-only job kept
      const ids = storeValue.map((j: ImportJob) => j.id);
      expect(ids).toContain("server-job");
      expect(ids).toContain("local-only-job");
    });
  });

  // ============================================================
  // deleteJob
  // ============================================================

  describe("deleteJob", () => {
    it("removes the job from the store", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({}));

      await deleteJob("job-del");

      expect(mockRemoveJob).toHaveBeenCalledWith("job-del");
    });

    it("clears cached files for the job", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({}));

      await deleteJob("job-del");

      expect(mockClearFiles).toHaveBeenCalledWith("job-del");
    });

    it("calls DELETE on /v1/import/jobs/:id", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({}));

      await deleteJob("job-del");

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/v1/import/jobs/job-del",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("does not throw when the DELETE API call fails (warns only)", async () => {
      mockApiFetch.mockRejectedValue(new Error("network gone"));

      await expect(deleteJob("job-del")).resolves.toBeUndefined();
      // removeJob and clearFiles should still have been called
      expect(mockRemoveJob).toHaveBeenCalledWith("job-del");
      expect(mockClearFiles).toHaveBeenCalledWith("job-del");
    });
  });

  // ============================================================
  // retryJob
  // ============================================================

  describe("retryJob", () => {
    it("patches the job on the server", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({}));

      await retryJob("job-retry");

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/v1/import/jobs/job-retry",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    it("resets job state in the store after successful PATCH", async () => {
      mockApiFetch.mockResolvedValue(makeOkResponse({}));

      await retryJob("job-retry");

      expect(mockUpdateJob).toHaveBeenCalledWith("job-retry", {
        status: "created",
        error: null,
        progress: 0,
      });
    });

    it("throws when the PATCH response is not ok", async () => {
      mockApiFetch.mockResolvedValue(makeErrorResponse(500, "Server Error"));

      await expect(retryJob("job-retry")).rejects.toThrow("Failed to retry job");
    });

    it("does not call updateJob when PATCH fails", async () => {
      mockApiFetch.mockResolvedValue(makeErrorResponse(500, "Server Error"));

      try {
        await retryJob("job-retry");
      } catch {
        // expected
      }

      expect(mockUpdateJob).not.toHaveBeenCalled();
    });

    it("propagates network errors", async () => {
      mockApiFetch.mockRejectedValue(new Error("timeout"));

      await expect(retryJob("job-retry")).rejects.toThrow("timeout");
    });
  });

  // ============================================================
  // processJob — error and abort paths (avoids SSE stream complexity)
  // ============================================================

  describe("processJob", () => {
    it("throws AbortError immediately when abort is called before SSE starts", async () => {
      // apiFetch will never resolve — simulates slow network
      mockApiFetch.mockReturnValue(new Promise(() => {}));

      const jobPromise = processJob("job-proc");

      // Give the promise a tick to set up the abort controller
      await new Promise((r) => setTimeout(r, 0));

      // Now delete the job (which aborts the controller)
      // We do this by directly rejecting via deleteJob flow—
      // instead simulate abort by getting the active controller via deleteJob
      // Easiest: just run deleteJob which calls controller.abort()
      mockApiFetch.mockResolvedValue(makeOkResponse({})); // for deleteJob's DELETE
      await deleteJob("job-proc");

      await expect(jobPromise).rejects.toThrow();
    });

    it("falls back to polling on 409 response (SSE already processing)", async () => {
      const completedJob = makeJob({ id: "job-poll", status: "completed" });

      mockApiFetch
        // First call: SSE process endpoint → 409
        .mockResolvedValueOnce(makeErrorResponse(409, "Conflict"))
        // Second call: poll fetchJob
        .mockResolvedValueOnce(makeOkResponse({ job: completedJob }));

      const result = await processJob("job-poll");

      expect(result.status).toBe("completed");
    });

    it("falls back to polling when response has no body", async () => {
      const completedJob = makeJob({ id: "job-nobody", status: "completed" });

      mockApiFetch
        // SSE process endpoint → ok but no body
        .mockResolvedValueOnce({ ok: true, status: 200, body: null, json: vi.fn() })
        // Poll fetchJob → completed
        .mockResolvedValueOnce(makeOkResponse({ job: completedJob }));

      const result = await processJob("job-nobody");

      expect(result.status).toBe("completed");
    });

    it("falls back to polling on network/fetch error", async () => {
      const completedJob = makeJob({ id: "job-neterr", status: "completed" });

      mockApiFetch
        // SSE process endpoint → network error
        .mockRejectedValueOnce(new Error("Failed to fetch"))
        // Poll fetchJob
        .mockResolvedValueOnce(makeOkResponse({ job: completedJob }));

      const result = await processJob("job-neterr");

      expect(result.status).toBe("completed");
    });

    it("rejects when poll fetchJob returns null (job not found)", async () => {
      mockApiFetch
        // SSE process → no body, triggers poll
        .mockResolvedValueOnce({ ok: true, status: 200, body: null, json: vi.fn() })
        // fetchJob → 404
        .mockResolvedValueOnce(makeErrorResponse(404, "Not Found"));

      await expect(processJob("job-missing")).rejects.toThrow("Job not found");
    });

    it("rejects when poll finds job in error status", async () => {
      const errorJob = makeJob({
        id: "job-err",
        status: "error",
        error: "AI analysis failed",
      });

      mockApiFetch
        .mockResolvedValueOnce({ ok: true, status: 200, body: null, json: vi.fn() })
        .mockResolvedValueOnce(makeOkResponse({ job: errorJob }));

      await expect(processJob("job-err")).rejects.toThrow("AI analysis failed");
      expect(mockAddError).toHaveBeenCalled();
    });

    it("calls onProgress callback during polling", async () => {
      const completedJob = makeJob({ id: "job-prog", status: "completed", progress: 100 });

      mockApiFetch
        .mockResolvedValueOnce({ ok: true, status: 200, body: null, json: vi.fn() })
        .mockResolvedValueOnce(makeOkResponse({ job: completedJob }));

      const onProgress = vi.fn();
      await processJob("job-prog", onProgress);

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ type: "complete", progress: 100 }),
      );
    });

    it("on native platform: fires process endpoint then polls", async () => {
      mockIsNativePlatform.mockReturnValue(true);
      const completedJob = makeJob({ id: "job-native", status: "completed" });

      mockApiFetch
        // fire-and-forget process call
        .mockResolvedValueOnce(makeOkResponse({}))
        // poll fetchJob
        .mockResolvedValueOnce(makeOkResponse({ job: completedJob }));

      const result = await processJob("job-native");

      expect(result.status).toBe("completed");
      // First apiFetch call is to the process endpoint
      expect(mockApiFetch.mock.calls[0][0]).toBe(
        "/v1/import/jobs/job-native/process",
      );
      expect(mockApiFetch.mock.calls[0][1]).toMatchObject({ method: "POST" });
    });

    it("on native platform: polls even if process call fails", async () => {
      mockIsNativePlatform.mockReturnValue(true);
      const completedJob = makeJob({ id: "job-native-fail", status: "completed" });

      mockApiFetch
        .mockRejectedValueOnce(new Error("connection refused"))
        .mockResolvedValueOnce(makeOkResponse({ job: completedJob }));

      const result = await processJob("job-native-fail");

      expect(result.status).toBe("completed");
    });

    it("falls back to polling on non-409 error from process endpoint", async () => {
      // Per source: the throw inside .then() is caught by .catch() which falls back to polling
      const completedJob = makeJob({ id: "job-forbidden", status: "completed" });

      mockApiFetch
        // Process endpoint returns 403 — throws inside .then() → .catch() → poll
        .mockResolvedValueOnce(
          makeErrorResponse(403, "Forbidden", { message: "Not allowed" }),
        )
        // Poll fetchJob → completed
        .mockResolvedValueOnce(makeOkResponse({ job: completedJob }));

      const result = await processJob("job-forbidden");

      expect(result.status).toBe("completed");
    });

    it("SSE complete event: resolves with fetched job", async () => {
      const completedJob = makeJob({ id: "job-sse", status: "completed" });

      // Build a minimal ReadableStream that emits a SSE complete event
      const sseData = `data: ${JSON.stringify({ type: "complete", stage: "done", progress: 100, message: "Done", timestamp: Date.now() })}\n\n`;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData));
          controller.close();
        },
      });

      mockApiFetch
        // SSE process endpoint — returns streaming body
        .mockResolvedValueOnce({ ok: true, status: 200, body: stream, json: vi.fn() })
        // fetchJob call inside the complete handler
        .mockResolvedValueOnce(makeOkResponse({ job: completedJob }));

      const result = await processJob("job-sse");

      expect(result.status).toBe("completed");
      expect(mockAddJob).toHaveBeenCalledWith(completedJob);
    });

    it("SSE error event: rejects with error message and calls addError", async () => {
      const sseData = `data: ${JSON.stringify({ type: "error", stage: "extract", progress: 0, message: "AI quota exceeded", timestamp: Date.now() })}\n\n`;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(sseData));
          controller.close();
        },
      });

      mockApiFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
        json: vi.fn(),
      });

      await expect(processJob("job-sse-err")).rejects.toThrow("AI quota exceeded");
      expect(mockAddError).toHaveBeenCalled();
    });
  });
});
