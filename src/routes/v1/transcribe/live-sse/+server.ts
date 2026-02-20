import { type RequestHandler } from "@sveltejs/kit";
import { sessions, processSession } from "./session-manager";

// GET endpoint for SSE stream
export const GET: RequestHandler = async ({ url }) => {
  const sessionId = url.searchParams.get("sessionId") || crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      // Create session
      sessions.set(sessionId, {
        controller,
        audioChunks: [],
        processing: false,
        lastSeq: 0,
        createdAt: Date.now(),
      });

      // Send initial connection message
      controller.enqueue(
        `data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`,
      );
    },
    cancel() {
      // Cleanup on disconnect
      const session = sessions.get(sessionId);
      if (session && session.audioChunks.length > 0) {
        void processSession(sessionId, true);
      }
      setTimeout(() => sessions.delete(sessionId), 5000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
