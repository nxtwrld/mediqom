import {
  test,
  expect,
  createMockDocument,
} from "../fixtures/documents-fixtures";

test.describe("Document viewer", () => {
  test("document list renders a tile, opens the detail view, and shows a section", async ({
    documentsPage,
  }) => {
    const page = documentsPage.page;
    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileId = new URL(page.url()).pathname
      .split("/med/p/")[1]
      .split("/")[0];

    const doc = createMockDocument({ user_id: profileId });
    await documentsPage.seed([doc]);
    await documentsPage.goto(`/med/p/${profileId}/documents`);

    const tile = page.locator("a.tile.-document", {
      hasText: doc.metadata.title,
    });
    await expect(tile).toBeVisible();

    await tile.click();
    await page.waitForURL(`**/med/p/${profileId}/documents/${doc.id}/`);

    await expect(page.locator(".heading.-heading-main h1.h1")).toContainText(
      doc.metadata.title,
    );
    await expect(page.locator(".list-items li.panel").first()).toContainText(
      doc.content.diagnosis[0].description,
    );

    // Delete asks for confirmation via the native dialog — dismiss it rather
    // than accepting, since removeDocument() would attempt a real deletion
    // against a document that was never actually persisted server-side.
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator(".toolbar button.-danger").click();
    await expect(page.locator(".heading.-heading-main h1.h1")).toBeVisible();
  });

  test("a missing document shows the not-found state", async ({
    documentsPage,
  }) => {
    const page = documentsPage.page;
    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileId = new URL(page.url()).pathname
      .split("/med/p/")[1]
      .split("/")[0];

    await documentsPage.mockDocumentNotFound(profileId, "missing-doc-id");
    await documentsPage.goto(`/med/p/${profileId}/documents/missing-doc-id`);

    await expect(page.locator(".not-found h2")).toBeVisible();
    await expect(page.locator(".not-found a.button.-primary")).toBeVisible();
  });
});
