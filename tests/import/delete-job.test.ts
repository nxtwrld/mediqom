import { test, expect, createMockJob } from "../fixtures/import-fixtures";
import { createStallingSSEEvents } from "../fixtures/mock-data";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PDF = path.join(__dirname, "..", "fixtures", "test-document.pdf");

test.describe("Import - Delete Job", () => {
  test("deleting a running job cancels without errors", async ({
    importPage,
  }) => {
    const jobId = "test-job-delete";
    let deleteWasCalled = false;

    // Set up mocks
    await importPage.mockJobList([]);
    await importPage.mockCreateJob(jobId);
    // SSE that stalls (never sends complete/error) — simulates long processing
    await importPage.mockProcessJobSSE(jobId, createStallingSSEEvents());
    await importPage.mockLayoutUpdate(jobId);
    // Mock the DELETE endpoint
    await importPage.mockDeleteJob(jobId, () => {
      deleteWasCalled = true;
    });
    // Mock polling fallback to return "extracting" status
    await importPage.mockFetchJob(
      jobId,
      createMockJob({ id: jobId, status: "extracting", progress: 20 }),
    );

    await importPage.open();
    await importPage.uploadFile(TEST_PDF);

    // Wait for the job card to appear
    const jobCard = importPage.page.locator(".job-progress-card");
    await expect(jobCard).toBeVisible({ timeout: 15000 });

    // Click the delete button
    const deleteBtn = importPage.page.locator(".delete-btn");
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // Job card should disappear
    await expect(jobCard).toHaveCount(0, { timeout: 10000 });

    // No error banner should appear — this validates the AbortController fix
    const errorBanner = importPage.page.locator(".error-banner");
    // Give a moment for any async errors to surface
    await importPage.page.waitForTimeout(1000);
    await expect(errorBanner).toHaveCount(0);

    // DELETE endpoint should have been called
    expect(deleteWasCalled).toBe(true);
  });
});
