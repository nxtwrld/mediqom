import { test, expect, createChatReplyEvents } from "../fixtures/chat-fixtures";

test.describe("Chat sidebar", () => {
  test("desktop: opens as a docked resizable panel, sends a message, receives a reply", async ({
    chatPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "desktop-only chrome assertions",
    );

    await chatPage.page.goto("/med");
    await chatPage.page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });

    await chatPage.open();
    await expect(chatPage.page.locator(".resize-handle")).toBeVisible();

    await chatPage.mockConversation(
      createChatReplyEvents("Sure, I can help with that."),
    );
    await chatPage.sendMessage("What does this report mean?");

    await expect(chatPage.page.locator(".message.user").last()).toContainText(
      "What does this report mean?",
    );
    await expect(
      chatPage.page.locator(".message.assistant").last(),
    ).toContainText("Sure, I can help with that.", { timeout: 15000 });
    await expect(chatPage.page.locator(".typing-indicator")).toHaveCount(0);

    await chatPage.close();
  });

  test("mobile: opens as a sheet under the living bar with no resize handle", async ({
    chatPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "mobile-only chrome assertions",
    );

    await chatPage.page.goto("/med");
    await chatPage.page.waitForURL(/\/med\/p\/[^/]+/, { timeout: 15000 });

    await chatPage.open();
    await expect(chatPage.page.locator(".resize-handle")).toBeHidden();

    // The sheet spans the bar's width (viewport minus the pill's side margins)
    const sidebarBox = await chatPage.page
      .locator(".chat-sidebar")
      .boundingBox();
    const viewport = chatPage.page.viewportSize();
    expect(sidebarBox?.width ?? 0).toBeGreaterThan((viewport?.width ?? 0) * 0.85);
    await expect(
      chatPage.page.getByRole("button", { name: "Close chat" }),
    ).toBeVisible();

    await chatPage.mockConversation(
      createChatReplyEvents("Here's what I found."),
    );
    await chatPage.sendMessage("Summarize my last visit");

    await expect(
      chatPage.page.locator(".message.assistant").last(),
    ).toContainText("Here's what I found.", { timeout: 15000 });
  });
});
