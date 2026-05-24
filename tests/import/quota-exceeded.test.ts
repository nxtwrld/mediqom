import { test, expect } from "../fixtures/import-fixtures";
import * as path from "path";

const TEST_PDF = path.join(__dirname, "..", "fixtures", "test-document.pdf");

test.describe("Import - Quota / Rate Limit", () => {
  test("shows error when job creation is rate-limited (429)", async ({ importPage, page }) => {
    // Mock GET jobs → empty list
    await importPage.mockJobList([]);

    // Mock POST /v1/import/jobs → 429
    await page.route("**/v1/import/jobs", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ message: "Too many requests. Please upgrade your plan." }),
        });
      } else {
        await route.continue();
      }
    });

    await importPage.open();
    await importPage.uploadFile(TEST_PDF);

    // An error message should appear
    const errorEl = page.locator(".import-error, [data-testid='import-error'], .error-message");
    await expect(errorEl).toBeVisible({ timeout: 15000 });
  });

  test("shows rate-limit error when SSE processing returns 429", async ({ importPage, page }) => {
    const jobId = "test-job-ratelimit";

    await importPage.mockJobList([]);
    await importPage.mockCreateJob(jobId);
    await importPage.mockLayoutUpdate(jobId);

    // Mock the process endpoint → 429
    await page.route(`**/v1/import/jobs/${jobId}/process`, async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ message: "Rate limit exceeded" }),
      });
    });

    // Mock fetchJob for polling fallback that also returns a rate limit error
    await page.route(`**/v1/import/jobs/${jobId}`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            job: {
              id: jobId,
              status: "error",
              error: "Rate limit exceeded. Please try again later.",
              progress: 0,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await importPage.open();
    await importPage.uploadFile(TEST_PDF);

    // Should see error state (not a generic "retry" flow — rate limits are not retried the same way)
    const jobCard = page.locator(".job-progress-card");
    await expect(jobCard).toBeVisible({ timeout: 15000 });

    // Eventually error state appears
    await expect(page.locator(".import-error, [data-testid='import-error'], .error-state, .job-error")).toBeVisible({ timeout: 20000 });
  });
});
