import { error, json, type RequestHandler } from "@sveltejs/kit";
import { Buffer } from "node:buffer";
import { sessions, processSession } from "../session-manager";

type ClientAudioMessage = {
  sessionId: string;
  pcm: string; // base64
  seq?: number;
  format?: "f32" | "i16";
  lang?: string;
  translate?: boolean;
  prompt?: string;
  final?: boolean;
};

function decodePcm(message: ClientAudioMessage): Float32Array {
  const format = message.format || "f32";
  const buffer = Buffer.from(message.pcm, "base64");

  if (format === "i16") {
    const view = new Int16Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / Int16Array.BYTES_PER_ELEMENT,
    );
    const float = new Float32Array(view.length);
    for (let i = 0; i < view.length; i++) {
      float[i] = view[i] / 32768;
    }
    return float;
  }

  return new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data: ClientAudioMessage = await request.json();

    if (!data.sessionId) {
      error(400, { message: "sessionId is required" });
    }

    const session = sessions.get(data.sessionId);
    if (!session) {
      error(404, {
        message: "Session not found. Ensure SSE stream is connected first.",
      });
    }

    // Update session instructions
    if (data.lang !== undefined) session.lang = data.lang;
    if (data.translate !== undefined) session.translate = data.translate;
    if (data.prompt !== undefined) session.prompt = data.prompt;

    // Decode and queue audio
    const audio = decodePcm(data);
    session.audioChunks.push(audio);

    // Process if ready
    void processSession(data.sessionId, data.final || false);

    return json({ success: true, queuedSamples: audio.length });
  } catch (err) {
    console.error("Audio ingestion error:", err);
    error(500, {
      message: err instanceof Error ? err.message : "Failed to process audio",
    });
  }
};
