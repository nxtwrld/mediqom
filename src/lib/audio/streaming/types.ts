/**
 * Streaming Transcription Types
 *
 * Interfaces for client-side direct streaming to transcription providers
 */

export enum StreamingState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Streaming = "streaming",
  Error = "error",
}

export interface StreamingOptions {
  language: string;
  model?: string;
  sampleRate?: number;
  encoding?: "linear16" | "float32";
  diarize?: boolean;
  punctuate?: boolean;
  interimResults?: boolean;
  smartFormat?: boolean;
  tokenType?: "token" | "bearer"; // Authentication protocol type
}

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  speaker?: string;
  startTime?: number;
  endTime?: number;
  words?: WordResult[];
  channel?: number;
}

export interface WordResult {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
  punctuatedWord?: string;
}

export interface StreamingError {
  code: string;
  message: string;
  recoverable: boolean;
  provider: string;
}

export type TranscriptCallback = (result: TranscriptResult) => void;
export type ErrorCallback = (error: StreamingError) => void;
export type StateCallback = (state: StreamingState) => void;

export interface StreamingProvider {
  readonly name: string;
  readonly isConnected: boolean;
  readonly state: StreamingState;

  connect(token: string, options: StreamingOptions): Promise<void>;
  disconnect(): void;
  sendAudio(audio: Int16Array | Float32Array): void;
  finalize(): void;

  onTranscript(callback: TranscriptCallback): void;
  onError(callback: ErrorCallback): void;
  onStateChange(callback: StateCallback): void;

  removeTranscriptListener(callback: TranscriptCallback): void;
  removeErrorListener(callback: ErrorCallback): void;
  removeStateListener(callback: StateCallback): void;
}

export interface TokenRequest {
  provider: "deepgram" | "google" | "auto";
  language: string;
  options?: {
    model?: string;
    diarize?: boolean;
    punctuate?: boolean;
    smartFormat?: boolean;
  };
}

export interface TokenResponse {
  provider: "deepgram" | "google";
  token: string;
  expiresAt: number;
  endpoint: string;
  metadata: {
    model: string;
    language: string;
    supportedFeatures: string[];
    tokenType?: "token" | "bearer"; // 'token' for API keys, 'bearer' for access tokens
  };
}

export interface TokenError {
  error: string;
  fallbackAvailable: boolean;
  fallbackEndpoint?: string;
}

// Deepgram-specific response types
export interface DeepgramResponse {
  type: "Results" | "Metadata" | "Error" | "UtteranceEnd";
  channel?: DeepgramChannel;
  is_final?: boolean;
  speech_final?: boolean;
  from_finalize?: boolean;
  request_id?: string;
  model_info?: {
    name: string;
    version: string;
  };
  error_code?: string;
  error_message?: string;
}

export interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

export interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words?: DeepgramWord[];
}

export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

// Language mapping utilities
export const DEEPGRAM_LANGUAGE_MAP: Record<string, string> = {
  cs: "cs",
  "cs-CZ": "cs",
  de: "de",
  "de-DE": "de",
  en: "en-US",
  "en-US": "en-US",
  "en-GB": "en-GB",
  es: "es",
  fr: "fr",
  it: "it",
  ja: "ja",
  ko: "ko",
  pt: "pt",
  ru: "ru",
  zh: "zh",
};

export function mapDeepgramLanguage(lang: string): string {
  return DEEPGRAM_LANGUAGE_MAP[lang] || lang;
}
