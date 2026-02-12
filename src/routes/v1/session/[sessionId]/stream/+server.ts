import { error, type RequestHandler } from "@sveltejs/kit";
import {
  getSession,
  getSessionEmitter,
  type SSEUpdate,
} from "$lib/session/manager";

export const GET: RequestHandler = async ({
  params,
  locals: { supabase, safeGetSession, user },
}) => {
  const { session } = await safeGetSession();

  if (!session || !user) {
    error(401, { message: "Unauthorized" });
  }

  const sessionId = params.sessionId!;
  console.log("📡 SSE stream requested for session:", sessionId);

  try {
    const sessionData = getSession(sessionId);

    if (!sessionData) {
      error(404, { message: "Session not found" });
    }

    // Verify session belongs to user
    if (sessionData.userId !== user.id) {
      error(403, { message: "Access denied to this session" });
    }

    // Create readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        console.log(`📡 SSE stream started for session ${sessionId}`);

        // Track controller state
        let isClosed = false;

        // Send initial connection message
        const initialMessage = {
          type: "session_status",
          data: {
            status: "connected",
            sessionId,
            timestamp: Date.now(),
            stats: {
              transcriptCount: sessionData.transcripts?.length || 0,
              hasOpenAIThread: !!sessionData.openaiThreadId,
              analysisInProgress:
                sessionData.analysisState?.analysisInProgress || false,
            },
          },
          timestamp: Date.now(),
        };

        try {
          controller.enqueue(`data: ${JSON.stringify(initialMessage)}\n\n`);
        } catch (error) {
          console.error("❌ Failed to send initial message:", error);
          isClosed = true;
        }

        // Get session event emitter
        const emitter = getSessionEmitter(sessionId);
        if (!emitter) {
          console.error("❌ No event emitter found for session:", sessionId);
          controller.close();
          isClosed = true;
          return;
        }

        // Listen for SSE updates
        const handleSSEUpdate = (update: SSEUpdate) => {
          if (isClosed) {
            console.log("⚠️ Skipping SSE update - controller is closed");
            return;
          }

          try {
            const data = `data: ${JSON.stringify(update)}\n\n`;
            controller.enqueue(data);
            console.log(`📡 SSE update sent:`, {
              type: update.type,
              sessionId,
              timestamp: update.timestamp,
            });
          } catch (err) {
            if (err && typeof err === 'object' && 'code' in err && err.code === "ERR_INVALID_STATE") {
              console.log("⚠️ SSE controller closed, marking as closed");
              isClosed = true;
            } else {
              console.error("❌ Error sending SSE update:", err);
            }
          }
        };

        // Listen for specific events
        emitter.on("sse_update", handleSSEUpdate);

        // Send periodic heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          if (isClosed) {
            clearInterval(heartbeatInterval);
            return;
          }

          try {
            const heartbeat = {
              type: "heartbeat",
              data: { timestamp: Date.now() },
              timestamp: Date.now(),
            };
            controller.enqueue(`data: ${JSON.stringify(heartbeat)}\n\n`);
          } catch (err) {
            if (err && typeof err === 'object' && 'code' in err && err.code === "ERR_INVALID_STATE") {
              console.log(
                "⚠️ SSE controller closed during heartbeat, stopping interval",
              );
              isClosed = true;
              clearInterval(heartbeatInterval);
            } else {
              console.error("❌ Error sending heartbeat:", err);
            }
          }
        }, 30000); // Every 30 seconds

        // Cleanup on close
        return () => {
          console.log(`📡 SSE stream cleanup for session ${sessionId}`);
          isClosed = true;
          emitter.off("sse_update", handleSSEUpdate);
          clearInterval(heartbeatInterval);
        };
      },

      cancel() {
        console.log(`📡 SSE stream cancelled for session ${sessionId}`);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    });
  } catch (err) {
    console.error("❌ SSE stream error:", err);
    error(500, { message: "Failed to create SSE stream" });
  }
};
