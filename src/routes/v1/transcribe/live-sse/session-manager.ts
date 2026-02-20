import { Buffer, File } from "node:buffer";
import { transcriptionProvider } from "$lib/ai/providers/transcription-abstraction";

// Session management for correlating SSE streams with audio chunks
export const sessions = new Map<
  string,
  {
    controller: ReadableStreamDefaultController;
    audioChunks: Float32Array[];
    processing: boolean;
    lang?: string;
    translate?: boolean;
    prompt?: string;
    lastSeq: number;
    createdAt: number;
  }
>();

// Cleanup sessions older than 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      try {
        session.controller.close();
      } catch {}
      sessions.delete(sessionId);
    }
  }
}, 60 * 1000);

const SAMPLE_RATE = 16000;
const WINDOW_SECONDS = 1;
const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SECONDS;

function float32ToWav(intended: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataBuffer = new ArrayBuffer(44 + intended.length * bytesPerSample);
  const view = new DataView(dataBuffer);

  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + intended.length * bytesPerSample, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, intended.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < intended.length; i++, offset += bytesPerSample) {
    const s = Math.max(-1, Math.min(1, intended[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Uint8Array(dataBuffer);
}

function flattenChunks(
  chunks: Float32Array[],
  takeSamples: number,
): Float32Array {
  const out = new Float32Array(takeSamples);
  let written = 0;
  while (chunks.length > 0 && written < takeSamples) {
    const next = chunks[0];
    const remaining = takeSamples - written;
    if (next.length <= remaining) {
      out.set(next, written);
      written += next.length;
      chunks.shift();
    } else {
      out.set(next.subarray(0, remaining), written);
      chunks[0] = next.subarray(remaining);
      written += remaining;
    }
  }
  return out;
}

async function transcribeChunk(
  audio: Float32Array,
  instructions: { lang?: string; translate?: boolean; prompt?: string },
) {
  const wav = float32ToWav(audio, SAMPLE_RATE);
  const file = new File([wav], "chunk.wav", { type: "audio/wav" }) as any;
  await transcriptionProvider.initialize();
  const result = await transcriptionProvider.transcribeAudioCompatible(file, {
    lang: instructions.lang || "en",
    translate: instructions.translate,
    prompt: instructions.prompt,
    chunkingStrategy: "auto",
  });
  return result;
}

export async function processSession(sessionId: string, force = false) {
  const session = sessions.get(sessionId);
  if (!session || session.processing) return;

  const totalSamples = session.audioChunks.reduce(
    (acc, c) => acc + c.length,
    0,
  );
  if (!force && totalSamples < WINDOW_SAMPLES) return;

  session.processing = true;
  try {
    const takeSamples = force ? totalSamples : WINDOW_SAMPLES;
    const chunk = flattenChunks(session.audioChunks, takeSamples);
    const result = await transcribeChunk(chunk, {
      lang: session.lang,
      translate: session.translate,
      prompt: session.prompt,
    });

    const payload = {
      type: force ? "final" : "partial",
      seq: session.lastSeq++,
      text: result.text,
      confidence: (result as any).confidence ?? 0.8,
    };

    session.controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (err) {
    console.error("Live transcription failed:", err);
    const errorPayload = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    session.controller.enqueue(`data: ${JSON.stringify(errorPayload)}\n\n`);
  } finally {
    session.processing = false;

    // Process more if accumulated
    const remaining = session.audioChunks.reduce((acc, c) => acc + c.length, 0);
    if (remaining >= WINDOW_SAMPLES) {
      void processSession(sessionId, false);
    }
  }
}
