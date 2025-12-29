import { error, json, type RequestHandler } from "@sveltejs/kit";
import { Buffer } from "node:buffer";
import { sessions, startGoogleStream, mapLanguage, MAX_STREAM_MS } from "../session-manager";

type ClientAudioMessage = {
  sessionId: string;
  pcm: string; // base64 Int16 LE
  seq?: number;
  lang?: string;
  final?: boolean;
};

function decodePcmBase64(pcm: string): Buffer {
  return Buffer.from(pcm, "base64");
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data: ClientAudioMessage = await request.json();

    if (!data.sessionId) {
      error(400, { message: "sessionId is required" });
    }

    const session = sessions.get(data.sessionId);
    if (!session) {
      error(404, { message: "Session not found. Ensure SSE stream is connected first." });
    }

    // Check if we need to rotate or change language
    const requestedLang = data.lang ? mapLanguage(data.lang) : session.lang;
    const needsRotation = session.googleStream && Date.now() - session.streamStartedAt >= MAX_STREAM_MS;
    const needsLanguageChange = requestedLang !== session.lang;

    if (needsRotation) {
      console.log(`Rotating Google stream after ${MAX_STREAM_MS}ms`);
      session.streamReady = false;
      startGoogleStream(data.sessionId, requestedLang);
    } else if (needsLanguageChange) {
      console.log(`Language changed from ${session.lang} to ${requestedLang}, restarting stream`);
      session.streamReady = false;
      startGoogleStream(data.sessionId, requestedLang);
    }

    // Check if stream exists
    if (!session.googleStream) {
      console.error("Google stream not initialized");
      error(500, { message: "Google stream not initialized" });
    }

    // Wait for stream to be ready (max 5 seconds)
    if (!session.streamReady) {
      console.log(`⏳ Waiting for Google stream to be ready (session: ${data.sessionId})...`);
      const maxWait = 5000;
      const startWait = Date.now();

      while (!session.streamReady && Date.now() - startWait < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));

        // Re-check session
        const currentSession = sessions.get(data.sessionId);
        if (!currentSession) {
          console.error("Session was deleted while waiting");
          error(500, { message: "Session was deleted" });
        }

        // If stream was destroyed but session exists, it might be restarting
        if (!currentSession.googleStream) {
          console.warn("Stream is null while waiting, continuing to wait...");
          // Don't error immediately, stream might be restarting
          continue;
        }

        // Check if stream was destroyed (but object still exists)
        if (currentSession.googleStream.destroyed) {
          console.warn("Stream destroyed while waiting, will retry...");
          // Stream might be restarting, continue waiting
          continue;
        }
      }

      if (!session.streamReady) {
        console.error("Stream not ready after timeout", {
          hasStream: !!session.googleStream,
          destroyed: session.googleStream?.destroyed
        });
        error(500, { message: "Stream initialization timeout" });
      }
    }

    // Decode audio
    const audioBuffer = decodePcmBase64(data.pcm);

    // Check if stream is destroyed before writing
    if (session.googleStream.destroyed) {
      console.error("Google stream was destroyed, restarting...");
      const success = startGoogleStream(data.sessionId, session.lang);
      if (!success) {
        error(500, { message: "Failed to restart Google stream" });
      }

      // Wait for new stream to be ready
      const maxWait = 2000;
      const startWait = Date.now();
      while (!session.streamReady && Date.now() - startWait < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (!session.streamReady || !session.googleStream) {
        error(500, { message: "Failed to restart stream" });
      }
    }

    // Write audio to stream
    try {
      console.log(`📤 Writing ${audioBuffer.length} bytes to Google stream (session: ${data.sessionId.substring(0, 8)}...)`);
      const ok = session.googleStream.write({ audioContent: audioBuffer });
      if (!ok) {
        console.warn("⚠️ Google stream backpressure: write returned false");
      } else {
        console.log(`✅ Audio written successfully to Google stream`);
      }
    } catch (writeErr) {
      console.error("❌ Failed to write to Google stream:", writeErr);

      // Try to restart stream and write again
      const success = startGoogleStream(data.sessionId, session.lang);
      if (success && session.googleStream && !session.googleStream.destroyed) {
        session.googleStream.write({ audioContent: audioBuffer });
      } else {
        error(500, {
          message: writeErr instanceof Error ? writeErr.message : "Failed to write audio"
        });
      }
    }

    // End stream if final
    if (data.final && session.googleStream && !session.googleStream.destroyed) {
      session.googleStream.end();
    }

    return json({ success: true, bytesWritten: audioBuffer.length });
  } catch (err) {
    console.error("Google audio ingestion error:", err);
    error(500, {
      message: err instanceof Error ? err.message : "Failed to process audio",
    });
  }
};

export const config = {
  runtime: "nodejs",
};
