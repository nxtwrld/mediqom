import { test as base, expect, type Page } from "@playwright/test";
import { shouldSkip } from "./skip";

/** Helper class for seeding documents and navigating without a full reload.
 * Uses the guarded window.__testHooks surface (see
 * src/lib/testing/test-hooks.ts) — documents are a client-side-encrypted
 * store with no simple REST endpoint to mock, so seeding goes straight into
 * the store instead. */
class DocumentsPage {
  constructor(public page: Page) {}

  async seed(docs: any[]) {
    await this.page.evaluate((docs) => {
      return (window as any).__testHooks.seedDocuments(docs);
    }, docs);
  }

  /** Client-side navigate via SvelteKit's own `goto` so the seeded in-memory
   * store survives (a real page.goto() would reload and reset it). */
  async goto(path: string) {
    await this.page.evaluate((path) => {
      (window as any).__testHooks.goto(path);
    }, path);
  }

  async mockDocumentNotFound(profileId: string, documentId: string) {
    await this.page.route(
      `**/v1/med/profiles/${profileId}/documents/${documentId}`,
      async (route) => {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "not found" }),
        });
      },
    );
  }
}

export const test = base.extend<{ documentsPage: DocumentsPage }>({
  documentsPage: async ({ page }, use, testInfo) => {
    const skipReason = shouldSkip();
    if (skipReason) {
      testInfo.skip(true, `Skipped: ${skipReason}`);
      return;
    }

    await use(new DocumentsPage(page));
  },
});

export { expect } from "@playwright/test";
export { createMockDocument } from "./mock-data";
