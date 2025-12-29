import { SpeechClient } from "@google-cloud/speech";
import {
  GCP_CLIENT_EMAIL,
  GCP_PRIVATE_KEY,
  GCP_PROJECT_ID,
  GOOGLE_APPLICATION_CREDENTIALS_JSON,
} from "$env/static/private";

type OutgoingMessage =
  | {
      type: "partial" | "final" | "connected";
      seq?: number;
      text?: string;
      confidence?: number;
      speakerTag?: string;
      sessionId?: string;
    }
  | { type: "error"; message: string };

const DEFAULT_LANGUAGE = "en-US";
const SAMPLE_RATE = 16000;
export const MAX_STREAM_MS = 4 * 60 * 1000;

// Session management
export const sessions = new Map<
  string,
  {
    controller: ReadableStreamDefaultController;
    googleStream: ReturnType<SpeechClient["streamingRecognize"]> | null;
    streamStartedAt: number;
    streamReady: boolean;
    serverSeq: number;
    speakerMap: Map<number, string>;
    speakerCounter: { current: number };
    lang: string;
    createdAt: number;
    lastPartialText: string; // Track last partial to avoid duplicates
  }
>();

// Cleanup old sessions
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      try {
        session.googleStream?.destroy();
        session.controller.close();
      } catch {}
      sessions.delete(sessionId);
    }
  }
}, 60 * 1000);

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

export function mapLanguage(lang?: string) {
  if (!lang) return DEFAULT_LANGUAGE;
  const normalized = lang.toLowerCase();
  if (normalized === "cs" || normalized === "cs-cz") return "cs-CZ";
  if (normalized === "de" || normalized === "de-de") return "de-DE";
  if (normalized === "en" || normalized === "en-us" || normalized === "en-gb")
    return "en-US";
  return lang;
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
        : {}
  );
}

function mapSpeakerTag(
  speakerMap: Map<number, string>,
  tag?: number | null,
  counterRef?: { current: number }
) {
  if (!tag) return undefined;
  if (!speakerMap.has(tag)) {
    const id = `S${counterRef ? ++counterRef.current : speakerMap.size + 1}`;
    speakerMap.set(tag, id);
  }
  return speakerMap.get(tag);
}

export function startGoogleStream(sessionId: string, languageCode: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  // Mark stream as not ready during initialization
  session.streamReady = false;

  // Close existing stream if any
  if (session.googleStream) {
    try {
      session.googleStream.destroy();
    } catch (err) {
      console.warn("Error destroying previous stream:", err);
    }
    session.googleStream = null;
  }

  try {
    const speechClient = getSpeechClient();

    session.googleStream = speechClient.streamingRecognize({
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

    session.streamStartedAt = Date.now();
    session.lang = languageCode;

    console.log(`Initializing Google stream for session ${sessionId} with language ${languageCode}`);

    // Mark stream as ready after connection establishes
    // Google Speech gRPC connection needs time to establish before accepting audio
    setTimeout(() => {
      if (session.googleStream && !session.googleStream.destroyed) {
        session.streamReady = true;
        console.log(`✅ Google stream ready for session ${sessionId} (lang: ${languageCode})`);
      } else {
        console.error(`❌ Stream destroyed before becoming ready for session ${sessionId}`);
      }
    }, 1000); // Increased to 1 second for gRPC connection establishment

    // Set up error handler first
    session.googleStream.on("error", (err: Error) => {
      console.error("Google STT stream error:", err);
      session.streamReady = false;

      const payload: OutgoingMessage = {
        type: "error",
        message: err.message,
      };
      try {
        session.controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {}

      // Mark stream as destroyed
      session.googleStream = null;
    });

    // Set up data handler
    session.googleStream.on("data", (response) => {
      const result = response.results?.[0];
      if (!result || !result.alternatives?.length) return;

      const alt = result.alternatives[0];
      const text = alt.transcript || "";
      const isFinal = result.isFinal || false;
      const words = alt.words || [];
      const lastWord = words.length ? words[words.length - 1] : undefined;
      const speakerTag = mapSpeakerTag(
        session.speakerMap,
        lastWord?.speakerTag,
        session.speakerCounter
      );

      // For partial results, Google sends the full text each time
      // Only send if text has changed or is final
      if (!isFinal && text === session.lastPartialText) {
        return; // Skip duplicate partial
      }

      // Update last partial text
      if (!isFinal) {
        session.lastPartialText = text;
      } else {
        // Clear last partial on final result
        session.lastPartialText = "";
      }

      const payload: OutgoingMessage = {
        type: isFinal ? "final" : "partial",
        seq: session.serverSeq++,
        text,
        confidence: alt.confidence ?? undefined,
        speakerTag,
      };

      try {
        session.controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (err) {
        console.error("Failed to send SSE message:", err);
      }
    });

    // Set up close handler
    session.googleStream.on("close", () => {
      console.log("Google stream closed for session:", sessionId);
      session.streamReady = false;
      session.googleStream = null;
    });

    return true;
  } catch (err) {
    console.error("Failed to create Google stream:", err);
    session.streamReady = false;
    session.googleStream = null;
    return false;
  }
}
