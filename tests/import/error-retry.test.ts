import { test, expect, createMockJob } from "../fixtures/import-fixtures";
import {
  createErrorSSEEvents,
  createSuccessSSEEvents,
} from "../fixtures/mock-data";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PDF = path.join(__dirname, "..", "fixtures", "test-document.pdf");

test.describe("Import - Error & Retry", () => {
  test("shows error state and retry button on failure", async ({
    importPage,
  }) => {
    const jobId = "test-job-error";
    const errorMessage = "AI extraction failed: rate limit exceeded";

    // Set up mocks
    await importPage.mockJobList([]);
    await importPage.mockCreateJob(jobId);
    await importPage.mockProcessJobSSE(
      jobId,
      createErrorSSEEvents(errorMessage),
    );
    await importPage.mockLayoutUpdate(jobId);
    // Fetch returns error state
    await importPage.mockFetchJob(
      jobId,
      createMockJob({
        id: jobId,
        status: "error",
        error: errorMessage,
        progress: 30,
      }),
    );

    await importPage.open();
    await importPage.uploadFile(TEST_PDF);

    // Wait for error state to appear on the card
    const errorCard = importPage.page.locator(".job-progress-card.error");
    await expect(errorCard).toBeVisible({ timeout: 15000 });

    // Error message should be displayed
    const errorMsg = importPage.page.locator(".error-message");
    await expect(errorMsg).toBeVisible();

    // Retry button should be present
    const retryBtn = importPage.page.locator(".error-row .button");
    await expect(retryBtn).toBeVisible();
  });

  test("retry re-processes the job successfully", async ({ importPage }) => {
    const jobId = "test-job-retry";
    const errorMessage = "Temporary failure";

    // Set up initial error mocks
    await importPage.mockJobList([]);
    await importPage.mockCreateJob(jobId);
    await importPage.mockProcessJobSSE(
      jobId,
      createErrorSSEEvents(errorMessage),
    );
    await importPage.mockLayoutUpdate(jobId);
    await importPage.mockFetchJob(
      jobId,
      createMockJob({
        id: jobId,
        status: "error",
        error: errorMessage,
        progress: 30,
      }),
    );

    await importPage.open();
    await importPage.uploadFile(TEST_PDF);

    // Wait for error card
    const errorCard = importPage.page.locator(".job-progress-card.error");
    await expect(errorCard).toBeVisible({ timeout: 15000 });

    // Now re-mock for successful retry
    await importPage.mockRetryJob(jobId);

    // Unroute process endpoint and re-mock with success
    await importPage.page.unroute(`**/v1/import/jobs/${jobId}/process`);
    await importPage.mockProcessJobSSE(jobId, createSuccessSSEEvents());

    // Update fetch mock to return completed job
    await importPage.page.unroute(`**/v1/import/jobs/${jobId}`);
    await importPage.mockRetryJob(jobId);
    await importPage.mockFetchJob(
      jobId,
      createMockJob({ id: jobId, status: "completed", progress: 100 }),
    );

    // Click retry
    const retryBtn = importPage.page.locator(".error-row .button");
    await retryBtn.click();

    // Error state should clear — card should no longer have error class
    await expect(errorCard).toHaveCount(0, { timeout: 15000 });
  });
});
