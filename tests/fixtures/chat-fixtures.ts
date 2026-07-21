import { test as base, expect, type Page } from "@playwright/test";
import { shouldSkip } from "./skip";
import {
  buildChatSSEBody,
  createChatReplyEvents,
  type ChatSSEEvent,
} from "./mock-data";

/** Helper class for chat sidebar interactions and API mocking */
class ChatPage {
  constructor(public page: Page) {}

  /** Open chat via whichever toggle is actually visible at the current viewport
   * (desktop header button vs. mobile bottom-nav icon — both share the same
   * literal aria-label). */
  async open() {
    await this.page.locator('button[aria-label="AI Chat"]:visible').click();
    await expect(this.page.locator(".chat-sidebar")).toBeVisible({
      timeout: 10000,
    });
  }

  async close() {
    // Second .chat-action-btn in .chat-actions is the close button.
    await this.page.locator(".chat-actions .chat-action-btn").nth(1).click();
    await expect(this.page.locator(".chat-sidebar")).toHaveCount(0);
  }

  /** Mock POST /v1/chat/conversation to reply with the given SSE events */
  async mockConversation(
    events: ChatSSEEvent[] = createChatReplyEvents("Hello, how can I help?"),
  ) {
    await this.page.route("**/v1/chat/conversation", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: buildChatSSEBody(events),
      });
    });
  }

  async sendMessage(text: string) {
    await this.page.locator(".input-container textarea").fill(text);
    await this.page.locator("button.send-btn").click();
  }
}

/**
 * Extended test fixture with `chatPage` helper.
 * Automatically skips tests when auth credentials are unavailable.
 */
export const test = base.extend<{ chatPage: ChatPage }>({
  chatPage: async ({ page }, use, testInfo) => {
    const skipReason = shouldSkip();
    if (skipReason) {
      testInfo.skip(true, `Skipped: ${skipReason}`);
      return;
    }

    await use(new ChatPage(page));
  },
});

export { expect } from "@playwright/test";
export { createChatReplyEvents } from "./mock-data";
