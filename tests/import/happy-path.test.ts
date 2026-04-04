import { test, expect, createMockJob } from "../fixtures/import-fixtures";
import {
  createSuccessSSEEvents,
} from "../fixtures/mock-data";
import * as path from "path";

const TEST_PDF = path.join(__dirname, "..", "fixtures", "test-document.pdf");

test.describe("Import - Happy Path", () => {
  test("upload file shows progress and completes", async ({ importPage }) => {
    const jobId = "test-job-happy";
    const completedJob = createMockJob({
      id: jobId,
      status: "completed",
      progress: 100,
    });

    // Set up mocks before opening
    await importPage.mockJobList([]);
    await importPage.mockCreateJob(jobId);
    await importPage.mockProcessJobSSE(jobId, createSuccessSSEEvents());
    await importPage.mockFetchJob(jobId, completedJob);
    await importPage.mockLayoutUpdate(jobId);

    await importPage.open();

    // Upload a test file
    await importPage.uploadFile(TEST_PDF);

    // A job progress card should appear during processing
    const jobCard = importPage.page.locator(".job-progress-card");
    await expect(jobCard).toBeVisible({ timeout: 15000 });

    // Wait for processing to complete — card should eventually disappear
    // or transition to completed state
    await expect(jobCard).toHaveCount(0, { timeout: 30000 });
  });

  test("progress updates are shown during processing", async ({
    importPage,
  }) => {
    const jobId = "test-job-progress";

    await importPage.mockJobList([]);
    await importPage.mockCreateJob(jobId);
    await importPage.mockProcessJobSSE(jobId, createSuccessSSEEvents());
    await importPage.mockFetchJob(
      jobId,
      createMockJob({ id: jobId, status: "completed", progress: 100 }),
    );
    await importPage.mockLayoutUpdate(jobId);

    await importPage.open();
    await importPage.uploadFile(TEST_PDF);

    // Progress card should show
    const jobCard = importPage.page.locator(".job-progress-card");
    await expect(jobCard).toBeVisible({ timeout: 15000 });

    // Progress fill should exist
    const progressFill = importPage.page.locator(".progress-fill");
    await expect(progressFill).toBeVisible({ timeout: 5000 });
  });
});
