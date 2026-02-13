import { Buffer } from "node:buffer";
import { error, type RequestHandler } from "@sveltejs/kit";
// File is available globally in Node 18+
import { transcriptionProvider } from "$lib/ai/providers/transcription-abstraction";

type ClientAudioMessage = {
  type: "audio";
  pcm: string; // base64
  ts?: number;
  sessionId?: string;
  seq?: number;
  format?: "f32" | "i16";
  lang?: string;
  translate?: boolean;
  prompt?: string;
};

type ClientControlMessage = {
  type: "control";
  action: "end";
};

type ClientMessage = ClientAudioMessage | ClientControlMessage;

const SAMPLE_RATE = 16000;
const WINDOW_SECONDS = 1;
const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SECONDS;

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

function float32ToWav(intended: Float32Array, sampleRate: number): Uint8Array {
  // Convert to 16-bit PCM WAV
  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataBuffer = new ArrayBuffer(44 + intended.length * bytesPerSample);
  const view = new DataView(dataBuffer);

  // RIFF identifier 'RIFF'
  view.setUint32(0, 0x52494646, false);
  // file length minus RIFF identifier length and file description length
  view.setUint32(4, 36 + intended.length * bytesPerSample, true);
  // RIFF type 'WAVE'
  view.setUint32(8, 0x57415645, false);
  // format chunk identifier 'fmt '
  view.setUint32(12, 0x666d7420, false);
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, byteRate, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bytesPerSample * 8, true);
  // data chunk identifier 'data'
  view.setUint32(36, 0x64617461, false);
  // data chunk length
  view.setUint32(40, intended.length * bytesPerSample, true);

  // PCM samples
  let offset = 44;
  for (let i = 0; i < intended.length; i++, offset += bytesPerSample) {
    const s = Math.max(-1, Math.min(1, intended[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Uint8Array(dataBuffer);
}

function flattenChunks(chunks: Float32Array[], takeSamples: number): Float32Array {
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
  instructions: Pick<ClientAudioMessage, "lang" | "translate" | "prompt">,
) {
  const wav = float32ToWav(audio, SAMPLE_RATE);
  const file = new File([wav], "chunk.wav", { type: "audio/wav" });
  await transcriptionProvider.initialize();
  const result = await transcriptionProvider.transcribeAudioCompatible(file, {
    lang: instructions.lang || "en",
    translate: instructions.translate,
    prompt: instructions.prompt,
    chunkingStrategy: "auto",
  });
  return result;
}

export const GET: RequestHandler = async ({ request }) => {
  const upgrade = request.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    error(426, { message: "Expected WebSocket upgrade" });
  }

  if (!(globalThis as any).WebSocketPair) {
    return new Response("WebSocket not supported on this platform", {
      status: 501,
    });
  }

  const pair = new (globalThis as any).WebSocketPair();
  const [client, server] = [pair[0], pair[1]] as WebSocket[];
  // Cloudflare Workers WebSocket API
  (server as any).accept();

  const chunks: Float32Array[] = [];
  let processing = false;
  let sequence = 0;
  let lastClientSeq: number | undefined = undefined;
  let lastInstructions: Pick<ClientAudioMessage, "lang" | "translate" | "prompt"> =
    {};

  async function maybeProcess(force = false) {
    if (processing) return;
    const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
    if (!force && totalSamples < WINDOW_SAMPLES) return;
    processing = true;
    try {
      const takeSamples = force ? totalSamples : WINDOW_SAMPLES;
      const chunk = flattenChunks(chunks, takeSamples);
      const result = await transcribeChunk(chunk, lastInstructions);
      const returnedSeq = lastClientSeq ?? sequence++;
      lastClientSeq = undefined;
      const payload = {
        type: force ? "final" : "partial",
        seq: returnedSeq,
        text: result.text,
        confidence: (result as any).confidence ?? 0.8,
      };
      server.send(JSON.stringify(payload));
    } catch (err) {
      console.error("Live transcription failed:", err);
      server.send(
        JSON.stringify({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      processing = false;
      // If more audio accumulated while processing, process again
      const remaining = chunks.reduce((acc, c) => acc + c.length, 0);
      if (remaining >= WINDOW_SAMPLES) {
        void maybeProcess(false);
      }
    }
  }

  server.addEventListener("message", (event: MessageEvent) => {
    try {
      const data: ClientMessage = JSON.parse(event.data.toString());
      if (data.type === "audio") {
        lastClientSeq = data.seq ?? lastClientSeq;
        lastInstructions = {
          lang: data.lang,
          translate: data.translate,
          prompt: data.prompt,
        };
        const audio = decodePcm(data);
        chunks.push(audio);
        void maybeProcess(false);
      } else if (data.type === "control" && data.action === "end") {
        void maybeProcess(true);
      }
    } catch (err) {
      console.error("Live WS message error:", err);
      server.send(
        JSON.stringify({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  });

  server.addEventListener("close", () => {
    if (chunks.length > 0) {
      void maybeProcess(true);
    }
    chunks.length = 0;
  });

  // Cloudflare Workers WebSocket response
  return new Response(null, {
    status: 101,
    webSocket: client,
  } as any);
};
