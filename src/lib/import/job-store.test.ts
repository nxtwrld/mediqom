import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get, writable } from "svelte/store";

// Mock $lib/i18n — t is a store whose value is a function returning the key.
// vi.mock is hoisted, but we can use vi.hoisted to create the value.
const { mockT } = vi.hoisted(() => {
  // We cannot import svelte/store here, so create a minimal compatible store
  // that the source file can call get() on.
  const subscribers: Set<(v: any) => void> = new Set();
  const fn = (key: string) => key;
  const mockT = {
    subscribe(cb: (v: any) => void) {
      subscribers.add(cb);
      cb(fn);
      return () => subscribers.delete(cb);
    },
  };
  return { mockT };
});

vi.mock("$lib/i18n", () => ({
  t: mockT,
}));

import {
  importJobs,
  importErrors,
  activeJobs,
  completedJobs,
  errorJobs,
  pendingJobs,
  addJob,
  updateJob,
  replaceJob,
  removeJob,
  addError,
  clearError,
  formatImportError,
} from "./job-store";
import type { ImportJob } from "./types";

/** Helper to create a minimal ImportJob for testing */
function makeJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: overrides.id ?? "job-1",
    user_id: "user-1",
    status: overrides.status ?? "created",
    stage: null,
    progress: overrides.progress ?? 0,
    message: null,
    error: overrides.error ?? null,
    scan_deducted: false,
    processing_started_at: null,
    file_count: overrides.file_count ?? 1,
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

describe("job-store", () => {
  beforeEach(() => {
    // Reset stores to empty before each test
    importJobs.set([]);
    importErrors.set([]);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- addJob ----

  describe("addJob", () => {
    it("adds a new job to the store", () => {
      const job = makeJob({ id: "j1" });
      addJob(job);

      const jobs = get(importJobs);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe("j1");
    });

    it("replaces an existing job with the same ID", () => {
      addJob(makeJob({ id: "j1", progress: 0 }));
      addJob(makeJob({ id: "j1", progress: 50 }));

      const jobs = get(importJobs);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].progress).toBe(50);
    });

    it("adds multiple jobs with different IDs", () => {
      addJob(makeJob({ id: "j1" }));
      addJob(makeJob({ id: "j2" }));

      expect(get(importJobs)).toHaveLength(2);
    });
  });

  // ---- updateJob ----

  describe("updateJob", () => {
    it("partially updates a job by ID", () => {
      addJob(makeJob({ id: "j1", status: "created", progress: 0 }));
      updateJob("j1", { status: "extracting", progress: 30 });

      const job = get(importJobs)[0];
      expect(job.status).toBe("extracting");
      expect(job.progress).toBe(30);
      // Other fields unchanged
      expect(job.id).toBe("j1");
    });

    it("does not affect other jobs", () => {
      addJob(makeJob({ id: "j1", progress: 0 }));
      addJob(makeJob({ id: "j2", progress: 0 }));

      updateJob("j1", { progress: 80 });

      const jobs = get(importJobs);
      expect(jobs.find((j) => j.id === "j1")!.progress).toBe(80);
      expect(jobs.find((j) => j.id === "j2")!.progress).toBe(0);
    });

    it("is a no-op when job ID does not exist", () => {
      addJob(makeJob({ id: "j1" }));
      updateJob("nonexistent", { progress: 99 });

      const jobs = get(importJobs);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].progress).toBe(0);
    });
  });

  // ---- replaceJob ----

  describe("replaceJob", () => {
    it("replaces old job with new job at the same index", () => {
      addJob(makeJob({ id: "old-id", status: "created" }));
      const newJob = makeJob({ id: "new-id", status: "extracting" });

      replaceJob("old-id", newJob);

      const jobs = get(importJobs);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe("new-id");
      expect(jobs[0].status).toBe("extracting");
    });

    it("appends new job if old ID not found", () => {
      addJob(makeJob({ id: "j1" }));
      const newJob = makeJob({ id: "j2" });

      replaceJob("nonexistent", newJob);

      expect(get(importJobs)).toHaveLength(2);
    });
  });

  // ---- removeJob ----

  describe("removeJob", () => {
    it("removes job by ID", () => {
      addJob(makeJob({ id: "j1" }));
      addJob(makeJob({ id: "j2" }));

      removeJob("j1");

      const jobs = get(importJobs);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe("j2");
    });

    it("is a no-op when job ID does not exist", () => {
      addJob(makeJob({ id: "j1" }));
      removeJob("nonexistent");

      expect(get(importJobs)).toHaveLength(1);
    });
  });

  // ---- Derived stores ----

  describe("derived stores", () => {
    it("activeJobs filters by active statuses", () => {
      addJob(makeJob({ id: "j1", status: "created" }));
      addJob(makeJob({ id: "j2", status: "extracting" }));
      addJob(makeJob({ id: "j3", status: "analyzing" }));
      addJob(makeJob({ id: "j4", status: "preparing" }));
      addJob(makeJob({ id: "j5", status: "loading" }));
      addJob(makeJob({ id: "j6", status: "completed" }));
      addJob(makeJob({ id: "j7", status: "error" }));

      const active = get(activeJobs);
      expect(active).toHaveLength(5);
      expect(active.map((j) => j.id).sort()).toEqual(
        ["j1", "j2", "j3", "j4", "j5"].sort(),
      );
    });

    it("completedJobs filters completed status only", () => {
      addJob(makeJob({ id: "j1", status: "completed" }));
      addJob(makeJob({ id: "j2", status: "error" }));
      addJob(makeJob({ id: "j3", status: "analyzing" }));

      const completed = get(completedJobs);
      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe("j1");
    });

    it("errorJobs filters error status only", () => {
      addJob(makeJob({ id: "j1", status: "error" }));
      addJob(makeJob({ id: "j2", status: "completed" }));

      const errors = get(errorJobs);
      expect(errors).toHaveLength(1);
      expect(errors[0].id).toBe("j1");
    });

    it("pendingJobs includes completed and error jobs", () => {
      addJob(makeJob({ id: "j1", status: "completed" }));
      addJob(makeJob({ id: "j2", status: "error" }));
      addJob(makeJob({ id: "j3", status: "extracting" }));

      const pending = get(pendingJobs);
      expect(pending).toHaveLength(2);
      expect(pending.map((j) => j.id).sort()).toEqual(["j1", "j2"]);
    });

    it("derived stores update reactively when importJobs changes", () => {
      addJob(makeJob({ id: "j1", status: "created" }));
      expect(get(activeJobs)).toHaveLength(1);
      expect(get(completedJobs)).toHaveLength(0);

      updateJob("j1", { status: "completed" });
      expect(get(activeJobs)).toHaveLength(0);
      expect(get(completedJobs)).toHaveLength(1);
    });
  });

  // ---- formatImportError ----

  describe("formatImportError", () => {
    it("returns rate-limit key for 429 errors", () => {
      expect(formatImportError("Error 429 Too Many Requests")).toBe(
        "app.import.error-rate-limit",
      );
    });

    it("returns rate-limit key for rate limit messages", () => {
      expect(formatImportError("rate limit exceeded")).toBe(
        "app.import.error-rate-limit",
      );
    });

    it("returns rate-limit key for quota messages", () => {
      expect(formatImportError("quota exceeded")).toBe(
        "app.import.error-rate-limit",
      );
    });

    it("returns network key for network errors", () => {
      expect(formatImportError("network error")).toBe(
        "app.import.error-network",
      );
    });

    it("returns network key for Failed to fetch", () => {
      expect(formatImportError("Failed to fetch")).toBe(
        "app.import.error-network",
      );
    });

    it("returns timeout key for timeout errors", () => {
      expect(formatImportError("Request timeout")).toBe(
        "app.import.error-timeout",
      );
    });

    it("returns unauthorized key for 401 errors", () => {
      expect(formatImportError("401 Unauthorized")).toBe(
        "app.import.error-unauthorized",
      );
    });

    it("returns unauthorized key for Unauthorized text", () => {
      expect(formatImportError("Unauthorized access")).toBe(
        "app.import.error-unauthorized",
      );
    });

    it("returns generic key for unknown errors", () => {
      expect(formatImportError("Something went wrong")).toBe(
        "app.import.error-generic",
      );
    });

    it("accepts Error objects", () => {
      expect(formatImportError(new Error("429 rate limited"))).toBe(
        "app.import.error-rate-limit",
      );
    });
  });

  // ---- addError / clearError ----

  describe("addError / clearError", () => {
    it("addError adds an error to importErrors", () => {
      addError("Something failed", "job-1");

      const errors = get(importErrors);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("Something failed");
      expect(errors[0].jobId).toBe("job-1");
      expect(errors[0].id).toBeDefined();
      expect(errors[0].timestamp).toBeGreaterThan(0);
    });

    it("addError works without jobId", () => {
      addError("General failure");

      const errors = get(importErrors);
      expect(errors).toHaveLength(1);
      expect(errors[0].jobId).toBeUndefined();
    });

    it("clearError removes error by id", () => {
      addError("Error 1");
      addError("Error 2");

      const errors = get(importErrors);
      expect(errors).toHaveLength(2);

      clearError(errors[0].id);
      expect(get(importErrors)).toHaveLength(1);
      expect(get(importErrors)[0].message).toBe("Error 2");
    });

    it("auto-dismisses error after 15 seconds", () => {
      addError("Temporary error");
      expect(get(importErrors)).toHaveLength(1);

      vi.advanceTimersByTime(15000);
      expect(get(importErrors)).toHaveLength(0);
    });
  });
});
