import { test, expect } from "../fixtures/import-fixtures";

test.describe("Import - Empty State", () => {
  test("shows empty state when no jobs exist", async ({ importPage }) => {
    // Mock empty job list
    await importPage.mockJobList([]);

    // Open import overlay
    await importPage.open();

    // Verify empty state is visible
    const emptyState = importPage.page.locator(".empty-state");
    await expect(emptyState).toBeVisible({ timeout: 5000 });

    // Verify "Add files" button/label is present
    const addFilesLabel = importPage.page.locator('label[for="upload-file"]');
    await expect(addFilesLabel).toBeVisible();

    // Verify no job cards are shown
    const jobCards = importPage.page.locator(".job-progress-card");
    await expect(jobCards).toHaveCount(0);
  });

  test("import overlay opens correctly", async ({ importPage }) => {
    await importPage.mockJobList([]);
    await importPage.open();

    // Verify the import view container is present
    const importView = importPage.page.locator(".import-view");
    await expect(importView).toBeVisible();

    // Verify file input exists (hidden but in DOM)
    const fileInput = importPage.page.locator("#upload-file");
    await expect(fileInput).toBeAttached();
  });
});
