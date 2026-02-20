import { writable, derived } from "svelte/store";
import type { ImportJob } from "./types";

/** Store for active import jobs */
export const importJobs = writable<ImportJob[]>([]);

/** Jobs that are still processing */
export const activeJobs = derived(importJobs, ($jobs) =>
  $jobs.filter((j) =>
    ["created", "extracting", "analyzing"].includes(j.status),
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

export function removeJob(jobId: string) {
  importJobs.update((jobs) => jobs.filter((j) => j.id !== jobId));
}
