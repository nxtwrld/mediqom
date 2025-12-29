import { type RequestHandler } from "@sveltejs/kit";
import { sessions, startGoogleStream, mapLanguage } from "./session-manager";

export const GET: RequestHandler = async ({ url }) => {
  const sessionId = url.searchParams.get("sessionId") || crypto.randomUUID();
  const lang = mapLanguage(url.searchParams.get("lang") || undefined);

  const stream = new ReadableStream({
    async start(controller) {
      sessions.set(sessionId, {
        controller,
        googleStream: null,
        streamStartedAt: 0,
        streamReady: false,
        serverSeq: 0,
        speakerMap: new Map(),
        speakerCounter: { current: 0 },
        lang,
        createdAt: Date.now(),
        lastPartialText: "",
      });

      // Start Google stream
      const success = startGoogleStream(sessionId, lang);

      if (!success) {
        controller.enqueue(
          `data: ${JSON.stringify({ type: "error", message: "Failed to initialize Google stream" })}\n\n`
        );
      }

      // Small delay to ensure stream is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send connection message
      controller.enqueue(
        `data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`
      );
    },
    cancel() {
      const session = sessions.get(sessionId);
      if (session) {
        session.googleStream?.end();
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

export const config = {
  runtime: "nodejs",
};
