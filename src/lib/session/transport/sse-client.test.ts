import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockConvertFloat32ToMp3, mockApiFetch } = vi.hoisted(() => ({
  mockConvertFloat32ToMp3: vi.fn(),
  mockApiFetch: vi.fn(),
}));

vi.mock("$lib/audio/microphone", () => ({
  convertFloat32ToMp3: mockConvertFloat32ToMp3,
}));

vi.mock("$lib/api/client", () => ({
  apiFetch: mockApiFetch,
}));

import { SSEClient } from "./sse-client";

// ── EventSource mock ──────────────────────────────────────────────────────────

class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = MockEventSource.CONNECTING;
  onopen: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;

  constructor(public url: string) {}

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  simulateOpen() {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.({});
  }

  simulateMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError() {
    this.readyState = MockEventSource.CLOSED;
    this.onerror?.({});
  }
}

let mockEventSourceInstances: MockEventSource[] = [];

global.EventSource = vi.fn().mockImplementation(function (this: any, url: string) {
  const instance = new MockEventSource(url);
  mockEventSourceInstances.push(instance);
  Object.assign(this, instance);
  // Make 'this' a proper mock by copying prototype methods
  this.close = () => instance.close();
  this.simulateOpen = () => {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.({});
  };
  this.simulateMessage = (data: any) => {
    this.onmessage?.({ data: JSON.stringify(data) });
  };
  this.simulateError = () => {
    this.readyState = MockEventSource.CLOSED;
    this.onerror?.({});
  };
  return this;
}) as any;
(global.EventSource as any).OPEN = MockEventSource.OPEN;
(global.EventSource as any).CONNECTING = MockEventSource.CONNECTING;
(global.EventSource as any).CLOSED = MockEventSource.CLOSED;

// ── helpers ───────────────────────────────────────────────────────────────────

function makeClient(opts: Partial<ConstructorParameters<typeof SSEClient>[0]> = {}) {
  return new SSEClient({ sessionId: "session-1", ...opts });
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("session/transport/SSEClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventSourceInstances = [];
    mockConvertFloat32ToMp3.mockResolvedValue(new Blob(["mp3"], { type: "audio/mp3" }));
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        transcription: { text: "Hello world", confidence: 0.95 },
        timestamp: Date.now(),
        sequenceNumber: 1,
        sessionId: "session-1",
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── constructor ─────────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("creates instance with sessionId", () => {
      const client = makeClient({ sessionId: "test-session" });
      expect(client).toBeInstanceOf(SSEClient);
    });

    it("registers onTranscript callback via EventEmitter", () => {
      const onTranscript = vi.fn();
      const client = makeClient({ onTranscript });
      client.emit("partial_transcript", { text: "test" });
      expect(onTranscript).toHaveBeenCalledWith({ text: "test" });
    });

    it("registers onAnalysis callback", () => {
      const onAnalysis = vi.fn();
      const client = makeClient({ onAnalysis });
      client.emit("analysis_update", { nodes: [] });
      expect(onAnalysis).toHaveBeenCalledWith({ nodes: [] });
    });

    it("registers onError callback", () => {
      const onError = vi.fn();
      const client = makeClient({ onError });
      client.emit("error", { message: "oops" });
      expect(onError).toHaveBeenCalledWith({ message: "oops" });
    });

    it("registers onStatus callback", () => {
      const onStatus = vi.fn();
      const client = makeClient({ onStatus });
      client.emit("session_status", { state: "active" });
      expect(onStatus).toHaveBeenCalledWith({ state: "active" });
    });

    it("does not register callbacks when not provided", () => {
      const client = makeClient();
      expect(() => client.emit("partial_transcript", {})).not.toThrow();
    });
  });

  // ── connect ─────────────────────────────────────────────────────────────────

  describe("connect()", () => {
    it("creates EventSource with correct URL", async () => {
      const client = makeClient({ sessionId: "my-session" });
      const connectPromise = client.connect();

      const es = (global.EventSource as any).mock.results[0]?.value;
      es.readyState = MockEventSource.OPEN;
      es.onopen?.({});

      await connectPromise;
      expect(global.EventSource).toHaveBeenCalledWith("/v1/session/my-session/stream");
    });

    it("resolves to true on successful connection", async () => {
      const client = makeClient();
      const connectPromise = client.connect();

      const es = (global.EventSource as any).mock.results[0]?.value;
      es.onopen?.({});

      const result = await connectPromise;
      expect(result).toBe(true);
    });

    it("returns true immediately when already connecting", async () => {
      const client = makeClient();
      // Start connecting without resolving
      const p1 = client.connect();
      const p2 = client.connect(); // called while isConnecting=true

      const es = (global.EventSource as any).mock.results[0]?.value;
      es.onopen?.({});
      await p1;

      expect(await p2).toBe(true);
    });
  });

  // ── handleMessage ────────────────────────────────────────────────────────────

  describe("handleMessage (via SSE message events)", () => {
    async function getConnectedClient() {
      const client = makeClient();
      const connectPromise = client.connect();
      const es = (global.EventSource as any).mock.results[0]?.value;
      es.onopen?.({});
      await connectPromise;
      return { client, es };
    }

    it("emits partial_transcript on message type", async () => {
      const { client, es } = await getConnectedClient();
      const handler = vi.fn();
      client.on("partial_transcript", handler);

      es.onmessage?.({ data: JSON.stringify({ type: "partial_transcript", data: { text: "hi" } }) });
      expect(handler).toHaveBeenCalledWith({ text: "hi" });
    });

    it("emits analysis_update on message type", async () => {
      const { client, es } = await getConnectedClient();
      const handler = vi.fn();
      client.on("analysis_update", handler);

      es.onmessage?.({ data: JSON.stringify({ type: "analysis_update", data: { nodes: [] } }) });
      expect(handler).toHaveBeenCalledWith({ nodes: [] });
    });

    it("emits session_status on message type", async () => {
      const { client, es } = await getConnectedClient();
      const handler = vi.fn();
      client.on("session_status", handler);

      es.onmessage?.({ data: JSON.stringify({ type: "session_status", data: { state: "active" } }) });
      expect(handler).toHaveBeenCalledWith({ state: "active" });
    });

    it("emits ai_thinking on message type", async () => {
      const { client, es } = await getConnectedClient();
      const handler = vi.fn();
      client.on("ai_thinking", handler);

      es.onmessage?.({ data: JSON.stringify({ type: "ai_thinking", data: {} }) });
      expect(handler).toHaveBeenCalled();
    });

    it("emits error on error message type", async () => {
      const { client, es } = await getConnectedClient();
      const handler = vi.fn();
      client.on("error", handler);

      es.onmessage?.({ data: JSON.stringify({ type: "error", data: { message: "server error" } }) });
      expect(handler).toHaveBeenCalledWith({ message: "server error" });
    });

    it("emits error event when JSON parsing fails", async () => {
      const { client, es } = await getConnectedClient();
      const handler = vi.fn();
      client.on("error", handler);

      es.onmessage?.({ data: "not-json{{" });
      expect(handler).toHaveBeenCalledWith({ message: "Invalid message format" });
    });
  });

  // ── sendAudioChunk ───────────────────────────────────────────────────────────

  describe("sendAudioChunk()", () => {
    it("converts audio to mp3 and posts to transcribe endpoint", async () => {
      const client = makeClient({ sessionId: "s1" });
      const audioData = new Float32Array(1024);

      const result = await client.sendAudioChunk(audioData);

      expect(mockConvertFloat32ToMp3).toHaveBeenCalledWith(audioData, 16000);
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/v1/session/s1/transcribe",
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toBe(true);
    });

    it("emits partial_transcript with transcription result", async () => {
      const client = makeClient();
      const transcriptHandler = vi.fn();
      client.on("partial_transcript", transcriptHandler);

      await client.sendAudioChunk(new Float32Array(512));

      expect(transcriptHandler).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Hello world", is_final: true }),
      );
    });

    it("returns false and emits error when response is not ok", async () => {
      mockApiFetch.mockResolvedValue({ ok: false, status: 500 });
      const client = makeClient();
      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      const result = await client.sendAudioChunk(new Float32Array(512));

      expect(result).toBe(false);
      expect(errorHandler).toHaveBeenCalledWith({ message: "Transcription failed" });
    });

    it("returns false and emits error on network failure", async () => {
      mockApiFetch.mockRejectedValue(new Error("Network down"));
      const client = makeClient();
      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      const result = await client.sendAudioChunk(new Float32Array(512));

      expect(result).toBe(false);
      expect(errorHandler).toHaveBeenCalledWith({ message: "Transcription error" });
    });

    it("emits create_placeholder before sending", async () => {
      const client = makeClient();
      const placeholderHandler = vi.fn();
      client.on("create_placeholder", placeholderHandler);

      await client.sendAudioChunk(new Float32Array(256));

      expect(placeholderHandler).toHaveBeenCalledWith(
        expect.objectContaining({ chunkId: expect.any(String), sequenceNumber: 1 }),
      );
    });

    it("increments sequenceNumber on each call", async () => {
      const client = makeClient();
      const placeholderHandler = vi.fn();
      client.on("create_placeholder", placeholderHandler);

      await client.sendAudioChunk(new Float32Array(256));
      await client.sendAudioChunk(new Float32Array(256));

      expect(placeholderHandler).toHaveBeenNthCalledWith(1, expect.objectContaining({ sequenceNumber: 1 }));
      expect(placeholderHandler).toHaveBeenNthCalledWith(2, expect.objectContaining({ sequenceNumber: 2 }));
    });
  });

  // ── disconnect ────────────────────────────────────────────────────────────────

  describe("disconnect()", () => {
    it("closes EventSource and isConnected becomes false", async () => {
      const client = makeClient();
      const connectPromise = client.connect();
      const es = (global.EventSource as any).mock.results[0]?.value;
      es.readyState = MockEventSource.OPEN;
      es.onopen?.({});
      await connectPromise;

      expect(client.isConnected).toBe(true);
      client.disconnect();
      expect(client.isConnected).toBe(false);
    });

    it("removes all event listeners", async () => {
      const client = makeClient();
      const connectPromise = client.connect();
      const es = (global.EventSource as any).mock.results[0]?.value;
      es.onopen?.({});
      await connectPromise;

      client.disconnect();
      expect(client.listenerCount("partial_transcript")).toBe(0);
    });

    it("does not throw when no EventSource is open", () => {
      const client = makeClient();
      expect(() => client.disconnect()).not.toThrow();
    });
  });

  // ── getters ───────────────────────────────────────────────────────────────────

  describe("isConnected getter", () => {
    it("returns false before connecting", () => {
      const client = makeClient();
      expect(client.isConnected).toBe(false);
    });

    it("returns true after open", async () => {
      const client = makeClient();
      const connectPromise = client.connect();
      const es = (global.EventSource as any).mock.results[0]?.value;
      es.readyState = MockEventSource.OPEN;
      es.onopen?.({});
      await connectPromise;
      expect(client.isConnected).toBe(true);
    });
  });

  describe("connectionState getter", () => {
    it("returns 'disconnected' when no eventSource", () => {
      const client = makeClient();
      expect(client.connectionState).toBe("disconnected");
    });

    it("returns 'connected' when EventSource is OPEN", async () => {
      const client = makeClient();
      const connectPromise = client.connect();
      const es = (global.EventSource as any).mock.results[0]?.value;
      es.readyState = MockEventSource.OPEN;
      es.onopen?.({});
      await connectPromise;
      expect(client.connectionState).toBe("connected");
    });
  });
});
