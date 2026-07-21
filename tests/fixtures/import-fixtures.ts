import { test as base, expect, type Page, type Route } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  buildSSEBody,
  createMockJob,
  createSuccessSSEEvents,
  type SSEEvent,
} from "./mock-data";
import type { ImportJob } from "../../src/lib/import/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKIP_MARKER = path.join(__dirname, "..", ".auth", "skip");

/** Check if tests should be skipped (missing credentials or auth failure) */
function shouldSkip(): string | false {
  if (fs.existsSync(SKIP_MARKER)) {
    return fs.readFileSync(SKIP_MARKER, "utf-8");
  }
  return false;
}

/** Helper class for import page interactions and API mocking */
class ImportPage {
  constructor(public page: Page) {}

  /** Navigate to /med and open the import overlay */
  async open() {
    await this.page.goto("/med");
    await this.page.waitForLoadState("networkidle");

    // Open import overlay via hash
    await this.page.evaluate(() => {
      location.hash = "#overlay-import";
    });

    // Wait for import view to appear
    await this.page.waitForSelector(".import-view", { timeout: 10000 });
  }

  /** Mock GET /v1/import/jobs to return the given job list */
  async mockJobList(jobs: ImportJob[] = []) {
    await this.page.route("**/v1/import/jobs", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ jobs }),
        });
      } else {
        await route.continue();
      }
    });
  }

  /** Mock POST /v1/import/jobs to return a new job ID */
  async mockCreateJob(jobId: string = "test-job-001") {
    await this.page.route("**/v1/import/jobs", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: jobId }),
        });
      } else {
        await route.continue();
      }
    });
  }

  /** Mock POST /v1/import/jobs/{id}/process to return SSE events */
  async mockProcessJobSSE(jobId: string, events: SSEEvent[]) {
    await this.page.route(
      `**/v1/import/jobs/${jobId}/process`,
      async (route) => {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
          body: buildSSEBody(events),
        });
      },
    );
  }

  /** Mock GET /v1/import/jobs/:id to return a specific job */
  async mockFetchJob(jobId: string, job: ImportJob) {
    await this.page.route(
      `**/v1/import/jobs/${jobId}`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ job }),
          });
        } else {
          await route.continue();
        }
      },
    );
  }

  /** Mock DELETE /v1/import/jobs/:id */
  async mockDeleteJob(
    jobId: string,
    callback?: () => void,
  ) {
    await this.page.route(
      `**/v1/import/jobs/${jobId}`,
      async (route) => {
        if (route.request().method() === "DELETE") {
          callback?.();
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          });
        } else {
          await route.continue();
        }
      },
    );
  }

  /** Mock PATCH /v1/import/jobs/:id (retry) */
  async mockRetryJob(jobId: string) {
    await this.page.route(
      `**/v1/import/jobs/${jobId}`,
      async (route) => {
        if (route.request().method() === "PATCH") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          });
        } else {
          await route.continue();
        }
      },
    );
  }

  /** Mock PATCH /v1/import/jobs/:id/layout (layout detection update) */
  async mockLayoutUpdate(jobId: string) {
    await this.page.route(
      `**/v1/import/jobs/${jobId}/layout`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      },
    );
  }

  /** Upload a file via the hidden file input */
  async uploadFile(filePath: string) {
    const input = this.page.locator("#upload-file");
    await input.setInputFiles(filePath);
  }
}

/**
 * Extended test fixture with `importPage` helper.
 * Automatically skips tests when auth credentials are unavailable.
 */
export const test = base.extend<{ importPage: ImportPage }>({
  importPage: async ({ page }, use, testInfo) => {
    const skipReason = shouldSkip();
    if (skipReason) {
      testInfo.skip(true, `Skipped: ${skipReason}`);
      return;
    }

    const importPage = new ImportPage(page);
    await use(importPage);
  },
});

export { expect } from "@playwright/test";
export { createMockJob, buildSSEBody } from "./mock-data";
