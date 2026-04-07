import { writable, derived, get } from "svelte/store";
import { t } from "$lib/i18n";
import type { ImportJob } from "./types";

/** Store for active import jobs */
export const importJobs = writable<ImportJob[]>([]);

// ---- Global import error tracking ----

export interface ImportError {
  id: string;
  message: string;
  jobId?: string;
  timestamp: number;
}

export const importErrors = writable<ImportError[]>([]);

export function addError(message: string, jobId?: string) {
  const error: ImportError = {
    id: crypto.randomUUID(),
    message,
    jobId,
    timestamp: Date.now(),
  };
  importErrors.update((errors) => [...errors, error]);
  // Auto-dismiss after 15s
  setTimeout(() => clearError(error.id), 15000);
}

export function clearError(id: string) {
  importErrors.update((errors) => errors.filter((e) => e.id !== id));
}

export function formatImportError(error: Error | string): string {
  const msg = typeof error === "string" ? error : error.message;
  const tr = get(t);

  // Always log the raw technical error for debugging
  console.error("[Import] Error:", msg);

  if (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("quota")
  ) {
    return tr("app.import.error-rate-limit");
  }
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("Failed to fetch")
  ) {
    return tr("app.import.error-network");
  }
  if (msg.includes("timeout")) {
    return tr("app.import.error-timeout");
  }
  if (msg.includes("Unauthorized") || msg.includes("401")) {
    return tr("app.import.error-unauthorized");
  }
  // Catch-all: generic user-friendly message for any unrecognized error
  return tr("app.import.error-generic");
}

/** Jobs that are still processing */
export const activeJobs = derived(importJobs, ($jobs) =>
  $jobs.filter((j) =>
    ["preparing", "created", "extracting", "analyzing", "loading"].includes(j.status),
  ),
);

/** Jobs ready for review */
export const completedJobs = derived(importJobs, ($jobs) =>
  $jobs.filter((j) => j.status === "completed"),
);

/** Jobs that failed */
export const errorJobs = derived(importJobs, ($jobs) =>
  $jobs.filter((j) => j.status === "error"),
);

/** Jobs needing attention (completed or errored) */
export const pendingJobs = derived(importJobs, ($jobs) =>
  $jobs.filter((j) => ["completed", "error"].includes(j.status)),
);

export function addJob(job: ImportJob) {
  importJobs.update((jobs) => {
    // Avoid duplicates
    const existing = jobs.findIndex((j) => j.id === job.id);
    if (existing >= 0) {
      jobs[existing] = job;
      return [...jobs];
    }
    return [...jobs, job];
  });
}

export function updateJob(jobId: string, updates: Partial<ImportJob>) {
  importJobs.update((jobs) =>
    jobs.map((j) => (j.id === jobId ? { ...j, ...updates } : j)),
  );
}

export function replaceJob(oldId: string, newJob: ImportJob) {
  importJobs.update((jobs) => {
    const idx = jobs.findIndex((j) => j.id === oldId);
    if (idx >= 0) {
      jobs[idx] = newJob;
      return [...jobs];
    }
    return [...jobs, newJob];
  });
}

export function removeJob(jobId: string) {
  importJobs.update((jobs) => jobs.filter((j) => j.id !== jobId));
}
