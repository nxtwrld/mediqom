import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mock factories ────────────────────────────────────────────────────
const mockAudioManager = vi.hoisted(() => ({
  getIsInitialized: vi.fn(() => false),
  getIsRecording: vi.fn(() => false),
  getState: vi.fn(() => "ready"),
  getAudioStream: vi.fn(() => null),
  initialize: vi.fn(async () => true),
  start: vi.fn(async () => true),
  stop: vi.fn(async () => {}),
  on: vi.fn(),
}));

const mockSSEClientInstance = vi.hoisted(() => ({
  connect: vi.fn(async () => true),
  disconnect: vi.fn(),
  sendAudioChunk: vi.fn(),
}));

const mockSSEClientClass = vi.hoisted(() => vi.fn(function() { return mockSSEClientInstance; }));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("$lib/logging/logger", () => ({
  logger: {
    audio: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    session: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  },
}));

vi.mock("$lib/audio/AudioManager", () => ({
  getAudioManager: () => mockAudioManager,
}));

vi.mock("$lib/audio/microphone", () => ({
  AudioState: {
    Ready: "ready",
    Listening: "listening",
    Speaking: "speaking",
    Stopping: "stopping",
    Stopped: "stopped",
    Error: "error",
  },
}));

vi.mock("../transport/sse-client", () => ({
  SSEClient: mockSSEClientClass,
}));

vi.mock("$lib/ui", () => ({
  default: { emit: vi.fn() },
}));

vi.mock("$lib/i18n", () => ({
  getLocale: vi.fn(() => "en"),
}));

vi.mock("$lib/api/client", () => ({
  apiFetch: vi.fn(),
}));

// Minimal unified-session-store mock with a real writable
vi.mock("./unified-session-store", async () => {
  const { writable } = await import("svelte/store");

  const store = writable({
    audio: {
      state: "ready",
      isRecording: false,
      sessionId: null,
      useRealtime: true,
      recordingStartTime: null,
      vadEnabled: false,
      speechChunks: [],
    },
    ui: {
      audioButtonPosition: "center",
      isOnNewSessionPage: false,
      isAnimating: false,
    },
    transport: {
      sseClient: null,
      connectionStatus: "disconnected",
      realtimeEnabled: false,
      reconnectAttempts: 0,
    },
    transcripts: {
      items: [],
      currentSegment: "",
      isStreaming: false,
    },
    error: null,
    lastUpdated: Date.now(),
  });

  return {
    unifiedSessionStore: store,
    AudioButtonPosition: {},
  };
});

// ── Import module under test AFTER all vi.mock() calls ─────────────────────
import { audioActions } from "./audio-actions";
import { unifiedSessionStore } from "./unified-session-store";
import { get } from "svelte/store";
import ui from "$lib/ui";
import { apiFetch } from "$lib/api/client";

// ── Helpers ───────────────────────────────────────────────────────────────────
function resetStore() {
  (unifiedSessionStore as any).set({
    audio: {
      state: "ready",
      isRecording: false,
      sessionId: null,
      useRealtime: true,
      recordingStartTime: null,
      vadEnabled: false,
      speechChunks: [],
    },
    ui: {
      audioButtonPosition: "center",
      isOnNewSessionPage: false,
      isAnimating: false,
    },
    transport: {
      sseClient: null,
      connectionStatus: "disconnected",
      realtimeEnabled: false,
      reconnectAttempts: 0,
    },
    transcripts: {
      items: [],
      currentSegment: "",
      isStreaming: false,
    },
    error: null,
    lastUpdated: Date.now(),
  });
}

beforeEach(async () => {
  // Reset module-level sseClient state before clearing mocks
  mockAudioManager.stop.mockResolvedValue(undefined);
  mockSSEClientInstance.disconnect.mockReturnValue(undefined);
  await audioActions.stopRecording();

  vi.clearAllMocks();
  resetStore();
  // Default: not initialized
  mockAudioManager.getIsInitialized.mockReturnValue(false);
  mockAudioManager.getIsRecording.mockReturnValue(false);
  mockAudioManager.getState.mockReturnValue("ready");
  mockAudioManager.initialize.mockResolvedValue(true);
  mockAudioManager.start.mockResolvedValue(true);
  mockAudioManager.stop.mockResolvedValue(undefined);
  mockSSEClientInstance.connect.mockResolvedValue(true);
  mockSSEClientClass.mockClear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("audioActions", () => {
  // ── createSession ───────────────────────────────────────────────────────────
  describe("createSession", () => {
    it("returns sessionId on success", async () => {
      (apiFetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "/v1/session/start",
        json: async () => ({ sessionId: "session-abc" }),
        text: async () => "",
      });

      const id = await audioActions.createSession("en", ["GP"]);
      expect(id).toBe("session-abc");
      expect(ui.emit).toHaveBeenCalledWith("session:created", { sessionId: "session-abc" });
    });

    it("returns null when response is not ok", async () => {
      (apiFetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        url: "/v1/session/start",
        text: async () => "Unauthorized",
        json: async () => ({}),
      });

      const id = await audioActions.createSession("en", ["GP"]);
      expect(id).toBeNull();
    });

    it("returns null when response JSON missing sessionId", async () => {
      (apiFetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "/v1/session/start",
        json: async () => ({}),
        text: async () => "",
      });

      const id = await audioActions.createSession("en", ["GP"]);
      expect(id).toBeNull();
    });

    it("returns null on network error", async () => {
      (apiFetch as any).mockRejectedValue(new Error("Network error"));

      const id = await audioActions.createSession();
      expect(id).toBeNull();
    });

    it("filters empty model strings before sending", async () => {
      (apiFetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "/v1/session/start",
        json: async () => ({ sessionId: "sess-1" }),
        text: async () => "",
      });

      await audioActions.createSession("de", ["GP", "", "  "]);

      const callArgs = (apiFetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.models).toEqual(["GP"]);
    });
  });

  // ── initializeSSE ───────────────────────────────────────────────────────────
  describe("initializeSSE", () => {
    it("returns true and updates store when SSE connects successfully", async () => {
      mockSSEClientInstance.connect.mockResolvedValue(true);

      const result = await audioActions.initializeSSE("session-123");

      expect(result).toBe(true);
      const state = get(unifiedSessionStore);
      expect(state.transport.connectionStatus).toBe("connected");
    });

    it("returns false when SSE connect fails", async () => {
      mockSSEClientInstance.connect.mockResolvedValue(false);

      const result = await audioActions.initializeSSE("session-123");
      expect(result).toBe(false);
    });

    it("returns false on SSE connection error", async () => {
      mockSSEClientInstance.connect.mockRejectedValue(new Error("Connection refused"));

      const result = await audioActions.initializeSSE("session-123");
      expect(result).toBe(false);
    });
  });

  // ── processAudioChunk ───────────────────────────────────────────────────────
  describe("processAudioChunk", () => {
    it("emits audio:chunk event when not using realtime", () => {
      const chunk = new Float32Array([0.1, 0.2, 0.3]);
      audioActions.processAudioChunk(chunk, false);

      expect(ui.emit).toHaveBeenCalledWith("audio:chunk", { audioData: chunk });
    });

    it("stores chunk in speechChunks when not using realtime", () => {
      const chunk = new Float32Array([0.1, 0.2]);
      audioActions.processAudioChunk(chunk, false);

      const state = get(unifiedSessionStore);
      expect(state.audio.speechChunks).toHaveLength(1);
      expect(state.audio.speechChunks[0]).toBe(chunk);
    });

    it("accumulates multiple chunks when not using realtime", () => {
      audioActions.processAudioChunk(new Float32Array([0.1]), false);
      audioActions.processAudioChunk(new Float32Array([0.2]), false);

      const state = get(unifiedSessionStore);
      expect(state.audio.speechChunks).toHaveLength(2);
    });

    it("does not store chunk when SSE client is null and useRealtime is true", () => {
      // SSE client is null (not connected), so it falls through to batch
      // but since sseClient is null, the SSE branch is skipped
      // The batch branch runs: stores chunk and emits event
      const chunk = new Float32Array([0.1]);
      audioActions.processAudioChunk(chunk, true);

      // Since sseClient is null, it falls into batch path
      expect(ui.emit).toHaveBeenCalledWith("audio:chunk", { audioData: chunk });
    });
  });

  // ── handleTranscript ────────────────────────────────────────────────────────
  describe("handleTranscript", () => {
    it("appends transcript item to store", () => {
      const transcript = {
        id: "t-1",
        text: "Hello doctor",
        confidence: 0.9,
        timestamp: 12345,
        is_final: true,
        speaker: "patient",
      };

      audioActions.handleTranscript(transcript as any);

      const state = get(unifiedSessionStore);
      expect(state.transcripts.items).toHaveLength(1);
      expect(state.transcripts.items[0].id).toBe("t-1");
      expect(state.transcripts.items[0].text).toBe("Hello doctor");
    });

    it("sets isStreaming to false for final transcripts", () => {
      audioActions.handleTranscript({
        id: "t-1",
        text: "Done",
        confidence: 0.9,
        timestamp: 100,
        is_final: true,
        speaker: "doctor",
      } as any);

      const state = get(unifiedSessionStore);
      expect(state.transcripts.isStreaming).toBe(false);
    });

    it("sets isStreaming to true for non-final transcripts", () => {
      audioActions.handleTranscript({
        id: "t-2",
        text: "Partial...",
        confidence: 0.5,
        timestamp: 200,
        is_final: false,
        speaker: "doctor",
      } as any);

      const state = get(unifiedSessionStore);
      expect(state.transcripts.isStreaming).toBe(true);
    });

    it("emits transcript:update event", () => {
      const transcript = {
        id: "t-3",
        text: "text",
        confidence: 0.8,
        timestamp: 300,
        is_final: true,
        speaker: "patient",
      };
      audioActions.handleTranscript(transcript as any);
      expect(ui.emit).toHaveBeenCalledWith("transcript:update", transcript);
    });
  });

  // ── handleSSEError ──────────────────────────────────────────────────────────
  describe("handleSSEError", () => {
    it("updates connectionStatus to error", () => {
      audioActions.handleSSEError("timeout");

      const state = get(unifiedSessionStore);
      expect(state.transport.connectionStatus).toBe("error");
    });

    it("increments reconnectAttempts", () => {
      audioActions.handleSSEError("first error");
      audioActions.handleSSEError("second error");

      const state = get(unifiedSessionStore);
      expect(state.transport.reconnectAttempts).toBe(2);
    });

    it("sets error message on store", () => {
      audioActions.handleSSEError("custom error msg");

      const state = get(unifiedSessionStore);
      expect(state.error).toContain("custom error msg");
    });
  });

  // ── setButtonPosition ───────────────────────────────────────────────────────
  describe("setButtonPosition", () => {
    it("updates audioButtonPosition in store", () => {
      audioActions.setButtonPosition("header");

      const state = get(unifiedSessionStore);
      expect(state.ui.audioButtonPosition).toBe("header");
    });

    it("sets isAnimating to true immediately", () => {
      audioActions.setButtonPosition("hidden");

      const state = get(unifiedSessionStore);
      expect(state.ui.isAnimating).toBe(true);
    });
  });

  // ── getAudioProcessor ───────────────────────────────────────────────────────
  describe("getAudioProcessor", () => {
    it("returns isInitialized false when AudioManager not initialized", () => {
      mockAudioManager.getIsInitialized.mockReturnValue(false);

      const proc = audioActions.getAudioProcessor();
      expect(proc.isInitialized).toBe(false);
      expect(proc.audio).toBeNull();
    });

    it("returns AudioManager reference when initialized", () => {
      mockAudioManager.getIsInitialized.mockReturnValue(true);

      const proc = audioActions.getAudioProcessor();
      expect(proc.isInitialized).toBe(true);
      expect(proc.audio).not.toBeNull();
    });
  });

  // ── isRecording ─────────────────────────────────────────────────────────────
  describe("isRecording", () => {
    it("delegates to AudioManager.getIsRecording", () => {
      mockAudioManager.getIsRecording.mockReturnValue(true);
      expect(audioActions.isRecording()).toBe(true);

      mockAudioManager.getIsRecording.mockReturnValue(false);
      expect(audioActions.isRecording()).toBe(false);
    });
  });

  // ── getAudioState ───────────────────────────────────────────────────────────
  describe("getAudioState", () => {
    it("delegates to AudioManager.getState", () => {
      mockAudioManager.getState.mockReturnValue("listening");
      expect(audioActions.getAudioState()).toBe("listening");
    });
  });

  // ── startRecording ──────────────────────────────────────────────────────────
  describe("startRecording", () => {
    it("returns false when AudioManager not initialized", async () => {
      mockAudioManager.getIsInitialized.mockReturnValue(false);

      const result = await audioActions.startRecording();
      expect(result).toBe(false);
    });

    it("updates store and emits event on success", async () => {
      mockAudioManager.getIsInitialized.mockReturnValue(true);
      mockAudioManager.start.mockResolvedValue(true);
      mockAudioManager.getState.mockReturnValue("listening");

      const result = await audioActions.startRecording();

      expect(result).toBe(true);
      const state = get(unifiedSessionStore);
      expect(state.audio.isRecording).toBe(true);
      expect(ui.emit).toHaveBeenCalledWith("audio:recording-started");
    });

    it("returns false when AudioManager.start returns false", async () => {
      mockAudioManager.getIsInitialized.mockReturnValue(true);
      mockAudioManager.start.mockResolvedValue(false);

      const result = await audioActions.startRecording();
      expect(result).toBe(false);
    });

    it("returns false when AudioManager.start throws", async () => {
      mockAudioManager.getIsInitialized.mockReturnValue(true);
      mockAudioManager.start.mockRejectedValue(new Error("mic denied"));

      const result = await audioActions.startRecording();
      expect(result).toBe(false);
    });
  });

  // ── stopRecording ───────────────────────────────────────────────────────────
  describe("stopRecording", () => {
    it("updates store and emits event after stopping", async () => {
      mockAudioManager.stop.mockResolvedValue(undefined);

      await audioActions.stopRecording();

      const state = get(unifiedSessionStore);
      expect(state.audio.isRecording).toBe(false);
      expect(state.audio.state).toBe("ready");
      expect(ui.emit).toHaveBeenCalledWith("audio:recording-stopped");
    });

    it("clears speechChunks", async () => {
      // Pre-populate chunks
      (unifiedSessionStore as any).update((s: any) => ({
        ...s,
        audio: { ...s.audio, speechChunks: [new Float32Array([0.1])] },
      }));

      await audioActions.stopRecording();

      const state = get(unifiedSessionStore);
      expect(state.audio.speechChunks).toHaveLength(0);
    });
  });

  // ── toggleRecording ─────────────────────────────────────────────────────────
  describe("toggleRecording", () => {
    it("returns false and ignores when state is Stopping", async () => {
      (unifiedSessionStore as any).update((s: any) => ({
        ...s,
        audio: { ...s.audio, state: "stopping" },
      }));

      const result = await audioActions.toggleRecording();
      expect(result).toBe(false);
      expect(mockAudioManager.stop).not.toHaveBeenCalled();
    });

    it("calls stopRecording when currently recording", async () => {
      (unifiedSessionStore as any).update((s: any) => ({
        ...s,
        audio: { ...s.audio, isRecording: true },
      }));

      const result = await audioActions.toggleRecording();
      expect(result).toBe(false);
      expect(mockAudioManager.stop).toHaveBeenCalled();
    });

    it("initializes and starts when not recording", async () => {
      // Not recording; initializeAudio needs session creation
      (apiFetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "/v1/session/start",
        json: async () => ({ sessionId: "sess-toggle" }),
        text: async () => "",
      });
      mockSSEClientInstance.connect.mockResolvedValue(true);
      // First call (in initializeAudio check) returns false → triggers initialize()
      // Subsequent calls (in startRecording check) return true → allows start
      mockAudioManager.getIsInitialized.mockReturnValueOnce(false).mockReturnValue(true);
      mockAudioManager.initialize.mockResolvedValue(true);
      mockAudioManager.start.mockResolvedValue(true);
      mockAudioManager.getState.mockReturnValue("listening");

      const result = await audioActions.toggleRecording();
      expect(result).toBe(true);
    });
  });

  // ── initializeAudio ─────────────────────────────────────────────────────────
  describe("initializeAudio", () => {
    it("returns true on successful initialization", async () => {
      (apiFetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "/v1/session/start",
        json: async () => ({ sessionId: "sess-init" }),
        text: async () => "",
      });
      mockSSEClientInstance.connect.mockResolvedValue(true);
      mockAudioManager.getIsInitialized.mockReturnValue(false);
      mockAudioManager.initialize.mockResolvedValue(true);

      const result = await audioActions.initializeAudio({ language: "en", models: ["GP"] });
      expect(result).toBe(true);
    });

    it("skips session creation when useRealtime is false", async () => {
      mockAudioManager.getIsInitialized.mockReturnValue(false);
      mockAudioManager.initialize.mockResolvedValue(true);

      const result = await audioActions.initializeAudio({ useRealtime: false });
      expect(result).toBe(true);
      expect(apiFetch).not.toHaveBeenCalled();
    });

    it("returns false when AudioManager initialization fails", async () => {
      mockAudioManager.getIsInitialized.mockReturnValue(false);
      mockAudioManager.initialize.mockResolvedValue(false);

      (apiFetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "/v1/session/start",
        json: async () => ({ sessionId: "sess-fail" }),
        text: async () => "",
      });
      mockSSEClientInstance.connect.mockResolvedValue(false);

      const result = await audioActions.initializeAudio({ useRealtime: false });
      expect(result).toBe(false);
      const state = get(unifiedSessionStore);
      expect(state.audio.state).toBe("error");
    });

    it("continues without realtime when SSE fails", async () => {
      (apiFetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "/v1/session/start",
        json: async () => ({ sessionId: "sess-sse-fail" }),
        text: async () => "",
      });
      mockSSEClientInstance.connect.mockResolvedValue(false);
      mockAudioManager.getIsInitialized.mockReturnValue(false);
      mockAudioManager.initialize.mockResolvedValue(true);

      const result = await audioActions.initializeAudio();
      expect(result).toBe(true);
    });

    it("skips AudioManager init when already initialized", async () => {
      mockAudioManager.getIsInitialized.mockReturnValue(true);

      const result = await audioActions.initializeAudio({ useRealtime: false });
      expect(result).toBe(true);
      expect(mockAudioManager.initialize).not.toHaveBeenCalled();
    });
  });

  // ── startRecordingWithAudio ─────────────────────────────────────────────────
  describe("startRecordingWithAudio", () => {
    it("delegates to initializeAudio", async () => {
      mockAudioManager.getIsInitialized.mockReturnValue(false);
      mockAudioManager.initialize.mockResolvedValue(true);

      (apiFetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        url: "/v1/session/start",
        json: async () => ({ sessionId: "sess-legacy" }),
        text: async () => "",
      });
      mockSSEClientInstance.connect.mockResolvedValue(true);

      const result = await audioActions.startRecordingWithAudio(null, {
        language: "en",
        models: ["GP"],
        useRealtime: true,
      });
      expect(result).toBe(true);
    });
  });
});
