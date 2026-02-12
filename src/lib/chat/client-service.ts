import type { ChatMessage, ChatContext, ChatResponse } from "./types.d";
import { generateId } from "$lib/utils/id";

export interface ChatStreamEvent {
  type:
    | "status"
    | "progress"
    | "response"
    | "error"
    | "chunk"
    | "metadata"
    | "complete";
  message?: string;
  stage?: string;
  progress?: number;
  data?: any;
  content?: string;
}

export class ChatClientService {
  private abortController: AbortController | null = null;

  /**
   * Send message to chat API and stream response
   */
  async sendMessage(
    message: string,
    context: ChatContext,
    conversationHistory: ChatMessage[],
    onEvent: (event: ChatStreamEvent) => void,
  ): Promise<void> {
    // Abort any existing request
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();

    try {
      const response = await fetch("/v1/chat/conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          mode: context.mode,
          profileId: context.currentProfileId,
          conversationHistory: conversationHistory.map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          })),
          language: context.language,
          pageContext: {
            ...context.pageContext,
            // Convert Map to array for JSON serialization
            documentsContent: context.pageContext.documentsContent
              ? Array.from(context.pageContext.documentsContent.entries())
              : [],
          },
          // Pass enhanced context features
          assembledContext: context.assembledContext,
          availableTools: context.availableTools,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = line.slice(6);
                if (data.trim()) {
                  const event: ChatStreamEvent = JSON.parse(data);
                  onEvent(event);
                }
              } catch (parseError) {
                console.error("Failed to parse SSE data:", parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Chat request aborted");
        return;
      }

      console.error("Chat request failed:", error);
      onEvent({
        type: "error",
        message: "Failed to send message. Please try again.",
      });
    }
  }

  /**
   * Cancel ongoing request
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if request is in progress
   */
  isProcessing(): boolean {
    return this.abortController !== null;
  }
}

export default ChatClientService;
