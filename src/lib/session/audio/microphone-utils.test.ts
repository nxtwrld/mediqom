import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/logging/logger", () => ({
  logger: {
    audio: {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

import { microphoneUtils } from "./microphone-utils";

// ---------------------------------------------------------------------------
// Browser API mocks
// ---------------------------------------------------------------------------

let mockTrack: {
  stop: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
  label: string;
  kind: string;
  readyState: string;
};

let mockStream: {
  getAudioTracks: ReturnType<typeof vi.fn>;
  getTracks: ReturnType<typeof vi.fn>;
};

let getUserMediaMock: ReturnType<typeof vi.fn>;
let enumerateDevicesMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  mockTrack = {
    stop: vi.fn(),
    getSettings: vi.fn().mockReturnValue({
      deviceId: "mic-1",
      sampleRate: 16000,
      channelCount: 1,
    }),
    label: "Built-in Mic",
    kind: "audio",
    readyState: "live",
  };

  mockStream = {
    getAudioTracks: vi.fn().mockReturnValue([mockTrack]),
    getTracks: vi.fn().mockReturnValue([mockTrack]),
  };

  getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
  enumerateDevicesMock = vi.fn().mockResolvedValue([
    { kind: "audioinput", deviceId: "mic-1", label: "Built-in Mic" },
    { kind: "videoinput", deviceId: "cam-1", label: "Camera" },
  ]);

  // navigator is read-only; patch mediaDevices via Object.defineProperty
  Object.defineProperty(global.navigator, "mediaDevices", {
    value: {
      getUserMedia: getUserMediaMock,
      enumerateDevices: enumerateDevicesMock,
    },
    writable: true,
    configurable: true,
  });

  global.AudioContext = vi.fn().mockImplementation(function (this: any) {
    this.sampleRate = 16000;
    this.state = "running";
    this.baseLatency = 0.01;
    this.resume = vi.fn().mockResolvedValue(undefined);
    this.createMediaStreamSource = vi.fn().mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
    this.createAnalyser = vi.fn().mockReturnValue({
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      connect: vi.fn(),
    });
  }) as unknown as typeof AudioContext;
});

// ---------------------------------------------------------------------------
// requestMicrophoneAccess
// ---------------------------------------------------------------------------

describe("microphoneUtils.requestMicrophoneAccess", () => {
  it("returns stream and granted permissions on success", async () => {
    const result = await microphoneUtils.requestMicrophoneAccess();

    expect(result.stream).toBe(mockStream);
    expect(result.permissions.granted).toBe(true);
    expect(result.permissions.deviceId).toBe("mic-1");
    expect(result.permissions.label).toBe("Built-in Mic");
    expect(result.permissions.error).toBeUndefined();
  });

  it("returns null stream and granted:false on failure", async () => {
    getUserMediaMock.mockRejectedValueOnce(new Error("Permission denied"));

    const result = await microphoneUtils.requestMicrophoneAccess();

    expect(result.stream).toBeNull();
    expect(result.permissions.granted).toBe(false);
    expect(result.permissions.error).toBe("Permission denied");
  });

  it("passes echoCancellation constraint through to getUserMedia", async () => {
    await microphoneUtils.requestMicrophoneAccess({ echoCancellation: false });

    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ echoCancellation: false }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// getAudioInputDevices
// ---------------------------------------------------------------------------

describe("microphoneUtils.getAudioInputDevices", () => {
  it("returns only audioinput devices, filtering out other kinds", async () => {
    const devices = await microphoneUtils.getAudioInputDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0].kind).toBe("audioinput");
    expect(devices[0].deviceId).toBe("mic-1");
  });

  it("returns empty array on error", async () => {
    enumerateDevicesMock.mockRejectedValueOnce(new Error("Enumerate failed"));

    const devices = await microphoneUtils.getAudioInputDevices();
    expect(devices).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkMicrophoneInUse
// ---------------------------------------------------------------------------

describe("microphoneUtils.checkMicrophoneInUse", () => {
  it("returns false and stops all tracks when getUserMedia succeeds", async () => {
    const result = await microphoneUtils.checkMicrophoneInUse();

    expect(result).toBe(false);
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("returns true when getUserMedia throws", async () => {
    getUserMediaMock.mockRejectedValueOnce(new DOMException("NotAllowedError"));

    const result = await microphoneUtils.checkMicrophoneInUse();
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createOptimizedAudioContext
// ---------------------------------------------------------------------------

describe("microphoneUtils.createOptimizedAudioContext", () => {
  it("returns an AudioContext with the requested sampleRate", async () => {
    const ctx = await microphoneUtils.createOptimizedAudioContext(44100);

    expect(ctx).not.toBeNull();
    expect(global.AudioContext).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 44100 }),
    );
  });

  it("returns null when AudioContext constructor throws", async () => {
    (global.AudioContext as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("AudioContext not supported");
    });

    const ctx = await microphoneUtils.createOptimizedAudioContext();
    expect(ctx).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stopMediaStream
// ---------------------------------------------------------------------------

describe("microphoneUtils.stopMediaStream", () => {
  it("calls track.stop() on all tracks", () => {
    const extraTrack = { stop: vi.fn() };
    mockStream.getTracks.mockReturnValue([mockTrack, extraTrack]);

    microphoneUtils.stopMediaStream(mockStream as unknown as MediaStream);

    expect(mockTrack.stop).toHaveBeenCalledTimes(1);
    expect(extraTrack.stop).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getMicrophoneLevel
// ---------------------------------------------------------------------------

describe("microphoneUtils.getMicrophoneLevel", () => {
  it("returns a number between 0 and 1", async () => {
    const mockAnalyser = {
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn().mockImplementation((arr: Uint8Array) => {
        arr.fill(128);
      }),
      connect: vi.fn(),
    };

    const mockSource = { connect: vi.fn(), disconnect: vi.fn() };

    const mockCtx = {
      createMediaStreamSource: vi.fn().mockReturnValue(mockSource),
      createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
    } as unknown as AudioContext;

    vi.useFakeTimers();
    const levelPromise = microphoneUtils.getMicrophoneLevel(
      mockStream as unknown as MediaStream,
      mockCtx,
    );
    await vi.runAllTimersAsync();
    const level = await levelPromise;
    vi.useRealTimers();

    expect(typeof level).toBe("number");
    expect(level).toBeGreaterThanOrEqual(0);
    expect(level).toBeLessThanOrEqual(1);
  });
});
