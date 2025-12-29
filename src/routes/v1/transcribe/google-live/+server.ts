import { Buffer } from "node:buffer";
import { error, type RequestHandler } from "@sveltejs/kit";
import { SpeechClient } from "@google-cloud/speech";
import {
  GCP_CLIENT_EMAIL,
  GCP_PRIVATE_KEY,
  GCP_PROJECT_ID,
  GOOGLE_APPLICATION_CREDENTIALS_JSON,
} from "$env/static/private";

type ClientAudioMessage = {
  type: "audio";
  seq?: number;
  pcm: string; // base64 Int16 LE
  ts?: number;
  lang?: string; // e.g., "en-US" or "cs-CZ"
};

type ClientControlMessage = {
  type: "control";
  action: "end";
};

type ClientMessage = ClientAudioMessage | ClientControlMessage;

type OutgoingMessage =
  | {
      type: "partial" | "final";
      seq: number;
      text: string;
      confidence?: number;
      speakerTag?: string;
    }
  | { type: "error"; message: string };

const DEFAULT_LANGUAGE = "en-US";
const SAMPLE_RATE = 16000;
const MAX_STREAM_MS = 4 * 60 * 1000; // rotate every 4 minutes to stay under provider limits

function buildCredentials() {
  if (GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
      return JSON.parse(GOOGLE_APPLICATION_CREDENTIALS_JSON);
    } catch (err) {
      console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON", err);
    }
  }

  if (GCP_CLIENT_EMAIL && GCP_PRIVATE_KEY) {
    return {
      client_email: GCP_CLIENT_EMAIL,
      private_key: GCP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  return undefined;
}

function mapLanguage(lang?: string) {
  if (!lang) return DEFAULT_LANGUAGE;
  const normalized = lang.toLowerCase();
  if (normalized === "cs" || normalized === "cs-cz") return "cs-CZ";
  if (normalized === "de" || normalized === "de-de") return "de-DE";
  if (normalized === "en" || normalized === "en-us" || normalized === "en-gb") return "en-US";
  return lang;
}

function decodePcmBase64(pcm: string): Buffer {
  return Buffer.from(pcm, "base64");
}

function getSpeechClient() {
  const credentials = buildCredentials();
  const projectId = GCP_PROJECT_ID || credentials?.project_id;

  return new SpeechClient(
    credentials
      ? {
          credentials,
          projectId,
        }
      : projectId
        ? { projectId }
        : {},
  );
}

function mapSpeakerTag(
  speakerMap: Map<number, string>,
  tag?: number | null,
  counterRef?: { current: number },
) {
  if (!tag) return undefined;
  if (!speakerMap.has(tag)) {
    const id = `S${counterRef ? ++counterRef.current : speakerMap.size + 1}`;
    speakerMap.set(tag, id);
  }
  return speakerMap.get(tag);
}

export const GET: RequestHandler = async ({ request }) => {
  const upgradeHeader = request.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    error(426, { message: "Expected WebSocket upgrade" });
  }

  if (!(globalThis as any).WebSocketPair) {
    return new Response("WebSocket not supported on this platform", { status: 501 });
  }

  const pair = new (globalThis as any).WebSocketPair();
  const [client, server] = [pair[0], pair[1]] as WebSocket[];
  server.accept();

  const speechClient = getSpeechClient();

  let googleStream: ReturnType<SpeechClient["streamingRecognize"]> | null = null;
  let streamStartedAt = 0;
  let serverSeq = 0;
  const speakerMap = new Map<number, string>();
  const speakerCounter = { current: 0 };

  const startGoogleStream = (languageCode: string) => {
    if (googleStream) {
      googleStream.destroy();
      googleStream = null;
    }

    googleStream = speechClient.streamingRecognize({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: SAMPLE_RATE,
        languageCode,
        enableAutomaticPunctuation: true,
        enableSpeakerDiarization: true,
        diarizationSpeakerCount: 2,
        model: "latest_long",
        useEnhanced: true,
      },
      interimResults: true,
      singleUtterance: false,
    });

    streamStartedAt = Date.now();

    googleStream.on("error", (err: Error) => {
      console.error("Google STT stream error:", err);
      const payload: OutgoingMessage = {
        type: "error",
        message: err.message,
      };
      try {
        server.send(JSON.stringify(payload));
      } catch {
        // ignore
      }
      try {
        server.close();
      } catch {
        // ignore
      }
    });

    googleStream.on("data", (response) => {
      const result = response.results?.[0];
      if (!result || !result.alternatives?.length) return;
      const alt = result.alternatives[0];
      const text = alt.transcript || "";
      const isFinal = result.isFinal || false;
      const words = alt.words || [];
      const lastWord = words.length ? words[words.length - 1] : undefined;
      const speakerTag = mapSpeakerTag(
        speakerMap,
        lastWord?.speakerTag,
        speakerCounter,
      );

      const payload: OutgoingMessage = {
        type: isFinal ? "final" : "partial",
        seq: serverSeq++,
        text,
        confidence: alt.confidence ?? undefined,
        speakerTag,
      };

      try {
        server.send(JSON.stringify(payload));
      } catch (err) {
        console.error("Failed to send WS message:", err);
      }
    });
  };

  const writeAudio = (buffer: Buffer) => {
    if (!googleStream) return;
    const ok = googleStream.write({ audioContent: buffer });
    if (!ok) {
      console.warn("Google stream backpressure: write returned false");
    }
  };

  startGoogleStream(mapLanguage());

  const maybeRotateStream = (languageCode: string) => {
    if (Date.now() - streamStartedAt >= MAX_STREAM_MS) {
      startGoogleStream(languageCode);
    }
  };

  server.addEventListener("message", (event: MessageEvent) => {
    try {
      const data: ClientMessage = JSON.parse(event.data.toString());
      if (data.type === "audio") {
        const lang = mapLanguage(data.lang);
        maybeRotateStream(lang);
        const audioBuffer = decodePcmBase64(data.pcm);
        writeAudio(audioBuffer);
      } else if (data.type === "control" && data.action === "end") {
        googleStream?.end();
      }
    } catch (err) {
      console.error("Failed to handle WS message:", err);
      const payload: OutgoingMessage = {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
      try {
        server.send(JSON.stringify(payload));
      } catch {
        // ignore
      }
    }
  });

  server.addEventListener("close", () => {
    googleStream?.end();
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
};

export const config = {
  runtime: "nodejs",
};
