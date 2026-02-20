import { get } from "svelte/store";
import { AudioState } from "$lib/audio/microphone";
import { getAudioManager } from "$lib/audio/AudioManager";
import type { PartialTranscript } from "../manager";
import { SSEClient } from "../transport/sse-client";
import { logger } from "$lib/logging/logger";
import ui from "$lib/ui";
import { getLocale } from "$lib/i18n";
import {
  unifiedSessionStore,
  type AudioButtonPosition,
} from "./unified-session-store";

// SSE client instance (managed separately from AudioManager)
let sseClient: SSEClient | null = null;

export const audioActions = {
  /**
   * Start recording with AudioManager (legacy method for backward compatibility)
   * This method is now a wrapper around the AudioManager singleton
   */
  async startRecordingWithAudio(
    _audio: any, // Ignored - AudioManager handles initialization
    options: {
      language?: string;
      models?: string[];
      useRealtime?: boolean;
    } = {},
  ): Promise<boolean> {
    const {
      language = getLocale() || "en",
      models = ["GP"],
      useRealtime = true,
    } = options;

    logger.audio.info(
      "Starting recording with AudioManager (legacy wrapper)...",
      {
        language,
        models,
        useRealtime,
      },
    );

    // Delegate to the unified session store's method which uses AudioManager
    return await audioActions.initializeAudio({
      language,
      models,
      useRealtime,
    });
  },
  /**
   * Initialize audio recording using AudioManager
   */
  async initializeAudio(
    options: {
      language?: string;
      models?: string[];
      useRealtime?: boolean;
      sessionId?: string;
    } = {},
  ): Promise<boolean> {
    const {
      language = getLocale() || "en",
      models = ["GP"],
      useRealtime = true,
      sessionId,
    } = options;

    logger.audio.info("Initializing audio recording with AudioManager...", {
      language,
      models,
      useRealtime,
      sessionId,
    });

    try {
      // Create session if needed and realtime is enabled
      let finalSessionId = sessionId;
      if (useRealtime && !finalSessionId) {
        finalSessionId =
          (await audioActions.createSession(language, models)) || undefined;
        if (!finalSessionId) {
          logger.audio.warn(
            "Failed to create session, continuing with local recording",
          );
        }
      }

      // Initialize SSE client for real-time processing if enabled
      if (useRealtime && finalSessionId) {
        const sseConnected = await audioActions.initializeSSE(finalSessionId);
        if (!sseConnected) {
          logger.audio.warn(
            "Failed to initialize SSE, falling back to non-realtime mode",
          );
        }
      }

      // Initialize AudioManager
      if (!getAudioManager().getIsInitialized()) {
        logger.audio.debug("Initializing AudioManager...");
        const initialized = await getAudioManager().initialize();

        if (!initialized) {
          throw new Error("Failed to initialize AudioManager");
        }
      }

      logger.audio.info("AudioManager successfully initialized", {
        hasStream: !!getAudioManager().getAudioStream(),
      });

      // Set up event handlers for audio processing
      const handleAudioChunk = (audioData: Float32Array) => {
        audioActions.processAudioChunk(audioData, useRealtime);
      };

      const handleStateChange = (state: AudioState) => {
        unifiedSessionStore.update((storeState) => ({
          ...storeState,
          audio: {
            ...storeState.audio,
            state: state,
          },
        }));
      };

      // Subscribe to AudioManager events
      getAudioManager().on("audio-chunk", handleAudioChunk);
      getAudioManager().on("state-change", handleStateChange);

      // Update store with successful initialization
      unifiedSessionStore.update((state) => ({
        ...state,
        audio: {
          ...state.audio,
          state: AudioState.Ready,
          sessionId: finalSessionId || null,
          useRealtime,
          recordingStartTime: Date.now(),
          vadEnabled: true,
        },
        transport: {
          ...state.transport,
          realtimeEnabled: useRealtime && sseClient !== null,
        },
        lastUpdated: Date.now(),
      }));

      return true;
    } catch (error) {
      logger.audio.error("Audio initialization failed:", error);
      unifiedSessionStore.update((state) => ({
        ...state,
        audio: {
          ...state.audio,
          state: AudioState.Error,
        },
        error: `Audio initialization failed: ${(error as Error).message}`,
      }));
      return false;
    }
  },

  /**
   * Start audio recording using AudioManager
   */
  async startRecording(): Promise<boolean> {
    logger.audio.info("Starting audio recording with AudioManager...");

    if (!getAudioManager().getIsInitialized()) {
      logger.audio.error("AudioManager not initialized");
      return false;
    }

    try {
      const success = await getAudioManager().start();

      if (success) {
        unifiedSessionStore.update((state) => ({
          ...state,
          audio: {
            ...state.audio,
            isRecording: true,
            state: getAudioManager().getState(),
          },
          ui: {
            ...state.ui,
            audioButtonPosition: state.ui.isOnNewSessionPage
              ? "header"
              : state.ui.audioButtonPosition,
            isAnimating: true,
          },
          lastUpdated: Date.now(),
        }));

        ui.emit("audio:recording-started");
      }

      return success;
    } catch (error) {
      logger.audio.error("Failed to start recording:", error);
      return false;
    }
  },

  /**
   * Stop audio recording using AudioManager
   */
  async stopRecording(): Promise<void> {
    logger.audio.info("Stopping audio recording with AudioManager...");

    unifiedSessionStore.update((state) => ({
      ...state,
      audio: {
        ...state.audio,
        isRecording: false,
        state: AudioState.Stopping,
      },
    }));

    try {
      // Stop AudioManager
      await getAudioManager().stop();
      logger.audio.info("AudioManager stopped successfully");

      // Disconnect SSE
      if (sseClient) {
        sseClient.disconnect();
        sseClient = null;
      }

      // Update final state
      unifiedSessionStore.update((state) => ({
        ...state,
        audio: {
          ...state.audio,
          state: AudioState.Ready,
          isRecording: false,
          sessionId: null,
          recordingStartTime: null,
          speechChunks: [],
        },
        ui: {
          ...state.ui,
          audioButtonPosition: state.ui.isOnNewSessionPage
            ? "center"
            : "hidden",
          isAnimating: true,
        },
        transport: {
          ...state.transport,
          sseClient: null,
          connectionStatus: "disconnected",
        },
        lastUpdated: Date.now(),
      }));

      ui.emit("audio:recording-stopped");
      logger.audio.info("Audio recording stopped successfully");
    } catch (error) {
      logger.audio.error("Error stopping recording:", error);
    }
  },

  /**
   * Toggle recording state
   */
  async toggleRecording(
    options: {
      language?: string;
      models?: string[];
      useRealtime?: boolean;
    } = {},
  ): Promise<boolean> {
    const currentState = get(unifiedSessionStore);

    if (currentState.audio.state === AudioState.Stopping) {
      logger.audio.debug("Recording is stopping, ignoring toggle");
      return false;
    }

    if (currentState.audio.isRecording) {
      await audioActions.stopRecording();
      return false;
    } else {
      const initialized = await audioActions.initializeAudio(options);
      if (initialized) {
        return await audioActions.startRecording();
      }
      return false;
    }
  },

  /**
   * Create a new session for recording
   */
  async createSession(
    language: string = getLocale() || "en",
    models: string[] = ["GP"],
  ): Promise<string | null> {
    logger.session.info("Creating new session...", { language, models });

    try {
      logger.session.debug("Making request to /v1/session/start...");
      const response = await fetch("/v1/session/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language,
          models: models.filter((model) => model && model.trim()),
        }),
      });

      logger.session.debug("Session creation response received", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.session.error("Session creation failed - response not ok:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          url: response.url,
        });
        return null;
      }

      const result = await response.json();
      logger.session.debug("Session creation response JSON:", result);

      if (result.sessionId) {
        logger.session.info("Session created successfully:", result.sessionId);
        ui.emit("session:created", { sessionId: result.sessionId });
        return result.sessionId;
      } else {
        logger.session.error(
          "Session creation response missing sessionId:",
          result,
        );
        return null;
      }
    } catch (error) {
      logger.session.error("Session creation network/parse error:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  },

  /**
   * Initialize SSE client for real-time processing
   */
  async initializeSSE(sessionId: string): Promise<boolean> {
    logger.audio.debug("Initializing SSE client...", { sessionId });

    if (sseClient) {
      logger.audio.warn("SSE client already exists");
      return true;
    }

    try {
      sseClient = new SSEClient({
        sessionId,
        onTranscript: (transcript: PartialTranscript) => {
          logger.audio.info("SSE transcript received:", transcript);
          audioActions.handleTranscript(transcript);
        },
        onAnalysis: (analysis: any) => {
          logger.audio.info("SSE analysis received:", analysis);
          ui.emit("analysis:update", analysis);
        },
        onError: (error: string) => {
          logger.audio.error("SSE client error:", error);
          audioActions.handleSSEError(error);
        },
        onStatus: (status: any) => {
          logger.audio.debug("SSE session status:", status);
        },
      });

      const connected = await sseClient.connect();
      if (connected) {
        unifiedSessionStore.update((state) => ({
          ...state,
          transport: {
            ...state.transport,
            sseClient,
            connectionStatus: "connected",
            reconnectAttempts: 0,
          },
        }));

        logger.audio.info("SSE connected successfully");
        return true;
      } else {
        logger.audio.error("Failed to connect SSE");
        sseClient = null;
        return false;
      }
    } catch (error) {
      logger.audio.error("SSE connection failed:", error);
      sseClient = null;
      return false;
    }
  },

  /**
   * Process audio chunk (real-time or batch)
   */
  processAudioChunk(audioData: Float32Array, useRealtime: boolean): void {
    if (useRealtime && sseClient) {
      logger.audio.debug("Sending audio chunk via SSE...", {
        size: audioData.length,
      });
      sseClient.sendAudioChunk(audioData);
    } else {
      logger.audio.debug("Using batch audio processing...", {
        size: audioData.length,
      });
      // Store chunk for batch processing
      unifiedSessionStore.update((state) => ({
        ...state,
        audio: {
          ...state.audio,
          speechChunks: [...state.audio.speechChunks, audioData],
        },
      }));
      ui.emit("audio:chunk", { audioData });
    }
  },

  /**
   * Handle transcript updates from SSE
   */
  handleTranscript(transcript: PartialTranscript): void {
    unifiedSessionStore.update((state) => ({
      ...state,
      transcripts: {
        ...state.transcripts,
        items: [
          ...state.transcripts.items,
          {
            id: transcript.id,
            text: transcript.text,
            confidence: transcript.confidence,
            timestamp: transcript.timestamp,
            is_final: transcript.is_final,
            speaker: transcript.speaker,
          },
        ],
        currentSegment: transcript.is_final ? "" : transcript.text,
        isStreaming: !transcript.is_final,
      },
      lastUpdated: Date.now(),
    }));

    ui.emit("transcript:update", transcript);
  },

  /**
   * Handle SSE errors
   */
  handleSSEError(error: string): void {
    logger.audio.error("SSE error occurred:", error);

    unifiedSessionStore.update((state) => ({
      ...state,
      transport: {
        ...state.transport,
        connectionStatus: "error",
        reconnectAttempts: state.transport.reconnectAttempts + 1,
      },
      error: `Connection error: ${error}`,
    }));
  },

  /**
   * Update audio button position
   */
  setButtonPosition(position: AudioButtonPosition): void {
    unifiedSessionStore.update((state) => ({
      ...state,
      ui: {
        ...state.ui,
        audioButtonPosition: position,
        isAnimating: true,
      },
    }));

    // Reset animation flag after transition
    setTimeout(() => {
      unifiedSessionStore.update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          isAnimating: false,
        },
      }));
    }, 500);
  },

  /**
   * Get current audio processor state (legacy compatibility)
   */
  getAudioProcessor(): { audio: any; sseClient: any; isInitialized: boolean } {
    return {
      audio: getAudioManager().getIsInitialized() ? getAudioManager() : null,
      sseClient: sseClient,
      isInitialized: getAudioManager().getIsInitialized(),
    };
  },

  /**
   * Check if audio is currently recording
   */
  isRecording(): boolean {
    return getAudioManager().getIsRecording();
  },

  /**
   * Get current audio state
   */
  getAudioState(): AudioState {
    return getAudioManager().getState();
  },
};

export default audioActions;
