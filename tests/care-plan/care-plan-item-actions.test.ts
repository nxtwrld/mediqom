import {
  test,
  expect,
  createMockCarePlanItem,
  createMockTask,
} from "../fixtures/careplan-fixtures";

const WHY_HERE = 'button[title="Why is this here?"]';

test.describe("Care Plan - item actions", () => {
  test("item-level provenance shows the source document and a conflict line, and opens the document", async ({
    carePlanPage,
  }) => {
    const page = carePlanPage.page;
    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileId = new URL(page.url()).pathname
      .split("/med/p/")[1]
      .split("/")[0];

    const item = createMockCarePlanItem({
      confirmingDocuments: ["doc-1"],
      contradictingDocuments: ["doc-2"],
    });
    await carePlanPage.seed([item]);
    await carePlanPage.goto(`/med/p/${profileId}/care-plan`);

    await page.locator(`.item-actions ${WHY_HERE}`).click();
    const reveal = page.locator(".careplan-item .provenance-reveal").first();
    await expect(reveal).toBeVisible();
    await expect(reveal.locator(".prov-link")).toHaveText("Open document");
    await expect(reveal.locator(".prov-conflict")).toBeVisible();

    await reveal.locator(".prov-link").click();
    await page.waitForURL(`**/med/p/${profileId}/documents/?doc=doc-1`);
  });

  test("task-level provenance resolves the document-quote, chat, and user paths independently", async ({
    carePlanPage,
  }) => {
    const page = carePlanPage.page;
    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileId = new URL(page.url()).pathname
      .split("/med/p/")[1]
      .split("/")[0];

    const item = createMockCarePlanItem({
      tasks: [
        createMockTask({
          text: "Quote task",
          sourceDocumentId: "doc-1",
          sourceQuote: "Please repeat the blood panel in 3 months.",
          sourceProvider: { name: "Dr. Novak" },
        }),
        createMockTask({ text: "Chat task", sourceMessageId: "msg-1" }),
        createMockTask({ text: "User task" }),
      ],
    });
    await carePlanPage.seed([item]);
    await carePlanPage.goto(`/med/p/${profileId}/care-plan`);

    const quoteRow = page.locator(".task-row", { hasText: "Quote task" });
    await quoteRow.locator(WHY_HERE).click();
    await expect(quoteRow.locator(".prov-copy")).toContainText(
      "Please repeat the blood panel in 3 months.",
    );
    await expect(quoteRow.locator(".prov-link")).toBeVisible();

    const chatRow = page.locator(".task-row", { hasText: "Chat task" });
    await chatRow.locator(WHY_HERE).click();
    await expect(chatRow.locator(".prov-link")).toHaveText("Open chat");
    await chatRow.locator(".prov-link").click();
    const chatSidebar = page.locator(".chat-sidebar");
    await expect(chatSidebar).toBeVisible();
    // Close it — on mobile the sidebar is full-viewport-width and would
    // otherwise intercept clicks on the task list below.
    await chatSidebar.getByRole("button", { name: "Close chat" }).click();
    await expect(chatSidebar).not.toBeVisible();

    const userRow = page.locator(".task-row", { hasText: "User task" });
    await userRow.locator(WHY_HERE).click();
    await expect(userRow.locator(".provenance-reveal")).toBeVisible();
    await expect(userRow.locator(".prov-link")).toHaveCount(0);
  });

  test("snooze dialog opens with a 2-week default and closes without persisting on Escape", async ({
    carePlanPage,
  }) => {
    const page = carePlanPage.page;
    await page.goto("/med");
    await page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });
    const profileId = new URL(page.url()).pathname
      .split("/med/p/")[1]
      .split("/")[0];

    const item = createMockCarePlanItem({
      tasks: [createMockTask({ text: "Snooze me" })],
    });
    await carePlanPage.seed([item]);
    await carePlanPage.goto(`/med/p/${profileId}/care-plan`);

    const taskRow = page.locator(".task-row", { hasText: "Snooze me" });
    await taskRow.getByRole("button", { name: "Remind me later" }).click();

    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".snooze-task")).toContainText("Snooze me");
    await expect(
      dialog.locator(".snooze-group").nth(1).locator(".option.-active"),
    ).toHaveText("2 weeks");

    // Close via Escape rather than Confirm: the seeded task's `key` isn't a
    // real encrypted blob, so the real save path (applyUserTaskAction ->
    // saveCarePlan -> updateDocument) would fail decryption — and even if it
    // didn't, this must never write back to a real Care Plan document.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(taskRow).not.toHaveClass(/-snoozed/);
  });
});
