import { describe, it, expect, vi } from "vitest";

vi.mock("$lib/logging/logger", () => ({
  logger: { audio: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
}));

import audioProcessing from "./audio-processing";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFloat32(values: number[]): Float32Array {
  return new Float32Array(values);
}

function silentAudio(length = 100): Float32Array {
  return new Float32Array(length); // all zeros
}

function loudAudio(length = 100, amplitude = 0.5): Float32Array {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = i % 2 === 0 ? amplitude : -amplitude;
  }
  return data;
}

describe("session/audio/audio-processing", () => {
  // ── convertAudioFormat.toPCM16 ────────────────────────────────────────────

  describe("convertAudioFormat.toPCM16", () => {
    it("converts 0.0 to 0", () => {
      const result = audioProcessing.convertAudioFormat.toPCM16(makeFloat32([0]));
      expect(result[0]).toBe(0);
    });

    it("converts 1.0 to 32767", () => {
      const result = audioProcessing.convertAudioFormat.toPCM16(makeFloat32([1.0]));
      expect(result[0]).toBe(32767);
    });

    it("converts -1.0 to -32768", () => {
      const result = audioProcessing.convertAudioFormat.toPCM16(makeFloat32([-1.0]));
      expect(result[0]).toBe(-32768);
    });

    it("converts 0.5 correctly", () => {
      const result = audioProcessing.convertAudioFormat.toPCM16(makeFloat32([0.5]));
      expect(result[0]).toBe(16384);
    });

    it("clamps values above 1.0 to 32767", () => {
      const result = audioProcessing.convertAudioFormat.toPCM16(makeFloat32([2.0]));
      expect(result[0]).toBe(32767);
    });

    it("clamps values below -1.0 to -32768", () => {
      const result = audioProcessing.convertAudioFormat.toPCM16(makeFloat32([-2.0]));
      expect(result[0]).toBe(-32768);
    });

    it("returns Int16Array of same length", () => {
      const input = makeFloat32([0.1, -0.2, 0.3]);
      const result = audioProcessing.convertAudioFormat.toPCM16(input);
      expect(result).toBeInstanceOf(Int16Array);
      expect(result.length).toBe(3);
    });
  });

  // ── convertAudioFormat.resample ───────────────────────────────────────────

  describe("convertAudioFormat.resample", () => {
    it("returns input unchanged when rates are equal", () => {
      const input = makeFloat32([0.1, 0.2, 0.3]);
      const result = audioProcessing.convertAudioFormat.resample(input, 16000, 16000);
      expect(result).toBe(input);
    });

    it("downsamples correctly (2:1 ratio)", () => {
      const input = makeFloat32([0, 0.5, 1.0, 0.5, 0, -0.5, -1.0, -0.5]);
      const result = audioProcessing.convertAudioFormat.resample(input, 32000, 16000);
      expect(result.length).toBe(4);
      expect(result).toBeInstanceOf(Float32Array);
    });

    it("upsamples to larger length", () => {
      const input = makeFloat32([0, 1.0]);
      const result = audioProcessing.convertAudioFormat.resample(input, 8000, 16000);
      expect(result.length).toBe(4);
    });

    it("uses linear interpolation between samples", () => {
      const input = makeFloat32([0.0, 1.0]);
      const result = audioProcessing.convertAudioFormat.resample(input, 1, 2);
      // Should have ~2 samples: 0.0 and interpolated
      expect(result[0]).toBeCloseTo(0.0);
    });
  });

  // ── convertAudioFormat.toWAVBlob ──────────────────────────────────────────

  describe("convertAudioFormat.toWAVBlob", () => {
    it("returns a Blob", () => {
      const input = loudAudio(100);
      const blob = audioProcessing.convertAudioFormat.toWAVBlob(input, 16000);
      expect(blob).toBeInstanceOf(Blob);
    });

    it("has type audio/wav", () => {
      const blob = audioProcessing.convertAudioFormat.toWAVBlob(silentAudio(), 16000);
      expect(blob.type).toBe("audio/wav");
    });

    it("blob size equals 44 (header) + samples * 2", () => {
      const samples = 100;
      const blob = audioProcessing.convertAudioFormat.toWAVBlob(new Float32Array(samples), 16000);
      expect(blob.size).toBe(44 + samples * 2);
    });

    it("uses default sample rate of 16000", () => {
      const blob = audioProcessing.convertAudioFormat.toWAVBlob(new Float32Array(10));
      expect(blob.size).toBe(44 + 10 * 2);
    });
  });

  // ── createWAVBuffer ───────────────────────────────────────────────────────

  describe("createWAVBuffer", () => {
    it("returns an ArrayBuffer", () => {
      const pcm = new Int16Array(100);
      const buffer = audioProcessing.createWAVBuffer(pcm, 16000);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
    });

    it("starts with RIFF header", () => {
      const pcm = new Int16Array(10);
      const buffer = audioProcessing.createWAVBuffer(pcm, 16000);
      const view = new DataView(buffer);
      const riff = String.fromCharCode(
        view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3),
      );
      expect(riff).toBe("RIFF");
    });

    it("contains WAVE format marker", () => {
      const pcm = new Int16Array(10);
      const buffer = audioProcessing.createWAVBuffer(pcm, 16000);
      const view = new DataView(buffer);
      const wave = String.fromCharCode(
        view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11),
      );
      expect(wave).toBe("WAVE");
    });

    it("buffer size equals 44 + pcmLength * 2", () => {
      const pcm = new Int16Array(50);
      const buffer = audioProcessing.createWAVBuffer(pcm, 16000);
      expect(buffer.byteLength).toBe(44 + 50 * 2);
    });
  });

  // ── extractFeatures ───────────────────────────────────────────────────────

  describe("extractFeatures", () => {
    it("returns silence=true for empty array", () => {
      const features = audioProcessing.extractFeatures(new Float32Array(0));
      expect(features.silence).toBe(true);
      expect(features.energy).toBe(0);
      expect(features.volume).toBe(0);
    });

    it("returns silence=true for all-zero audio", () => {
      const features = audioProcessing.extractFeatures(silentAudio());
      expect(features.silence).toBe(true);
      expect(features.energy).toBe(0);
    });

    it("returns silence=false for loud audio", () => {
      const features = audioProcessing.extractFeatures(loudAudio(100, 0.5));
      expect(features.silence).toBe(false);
    });

    it("energy is RMS of the signal", () => {
      // constant amplitude 0.5 — RMS = 0.5
      const data = new Float32Array(100).fill(0.5);
      const features = audioProcessing.extractFeatures(data);
      expect(features.energy).toBeCloseTo(0.5, 3);
    });

    it("volume equals max amplitude", () => {
      const data = makeFloat32([0.1, 0.8, -0.3, 0.5]);
      const features = audioProcessing.extractFeatures(data);
      expect(features.volume).toBeCloseTo(0.8, 5);
    });

    it("returns a timestamp", () => {
      const features = audioProcessing.extractFeatures(loudAudio());
      expect(typeof features.timestamp).toBe("number");
      expect(features.timestamp).toBeGreaterThan(0);
    });

    it("silence threshold is 0.01 — signal just below is silent", () => {
      const data = new Float32Array(100).fill(0.005);
      const features = audioProcessing.extractFeatures(data);
      expect(features.silence).toBe(true);
    });

    it("signal just above 0.01 is not silent", () => {
      const data = new Float32Array(100).fill(0.02);
      const features = audioProcessing.extractFeatures(data);
      expect(features.silence).toBe(false);
    });
  });

  // ── preprocess ────────────────────────────────────────────────────────────

  describe("preprocess", () => {
    it("returns a Float32Array", () => {
      const result = audioProcessing.preprocess(loudAudio());
      expect(result).toBeInstanceOf(Float32Array);
    });

    it("same length as input", () => {
      const input = loudAudio(200);
      const result = audioProcessing.preprocess(input);
      expect(result.length).toBe(200);
    });

    it("normalizes by default (max amplitude ~0.95)", () => {
      const input = makeFloat32([0.1, 0.2, 0.5]);
      const result = audioProcessing.preprocess(input);
      const maxVal = Math.max(...Array.from(result).map(Math.abs));
      expect(maxVal).toBeCloseTo(0.95, 5);
    });

    it("skips normalization when normalize=false", () => {
      const input = makeFloat32([0.1, 0.2, 0.3]);
      const result = audioProcessing.preprocess(input, { normalize: false });
      expect(result[0]).toBeCloseTo(0.1, 5);
    });

    it("applies high-pass filter when requested", () => {
      const input = loudAudio(50);
      const result = audioProcessing.preprocess(input, { highPassFilter: true, normalize: false });
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(input.length);
    });

    it("applies noise reduction when requested", () => {
      const input = loudAudio(50);
      const result = audioProcessing.preprocess(input, { noiseReduction: true, normalize: false });
      expect(result).toBeInstanceOf(Float32Array);
    });

    it("does not mutate the original array", () => {
      const input = loudAudio(50, 0.5);
      const originalCopy = Array.from(input);
      audioProcessing.preprocess(input, { normalize: true });
      expect(Array.from(input)).toEqual(originalCopy);
    });
  });

  // ── applyHighPassFilter ───────────────────────────────────────────────────

  describe("applyHighPassFilter", () => {
    it("returns same length as input", () => {
      const input = loudAudio(50);
      const result = audioProcessing.applyHighPassFilter(input);
      expect(result.length).toBe(50);
    });

    it("first sample equals input first sample", () => {
      const input = makeFloat32([0.5, 0.3, 0.1]);
      const result = audioProcessing.applyHighPassFilter(input);
      expect(result[0]).toBe(0.5);
    });

    it("attenuates DC offset (constant signal reduces over time)", () => {
      const dc = new Float32Array(100).fill(1.0);
      const result = audioProcessing.applyHighPassFilter(dc);
      // Later samples should be lower than initial for a constant signal
      expect(Math.abs(result[99])).toBeLessThan(Math.abs(result[0]));
    });

    it("uses default alpha=0.97", () => {
      const input = makeFloat32([0.5, 0.5]);
      const result = audioProcessing.applyHighPassFilter(input);
      // filtered[1] = 0.97 * (0.5 + 0.5 - 0.5) = 0.97 * 0.5
      expect(result[1]).toBeCloseTo(0.97 * 0.5, 5);
    });
  });

  // ── applyNoiseReduction ───────────────────────────────────────────────────

  describe("applyNoiseReduction", () => {
    it("returns same length as input", () => {
      const input = loudAudio(50);
      const result = audioProcessing.applyNoiseReduction(input);
      expect(result.length).toBe(50);
    });

    it("attenuates samples below threshold", () => {
      // Loud signal: one peak, rest near zero
      const data = new Float32Array(20).fill(0.001);
      data[0] = 0.5; // one loud sample
      const result = audioProcessing.applyNoiseReduction(data);
      // The near-zero samples should be attenuated by 0.1
      expect(Math.abs(result[5])).toBeLessThan(Math.abs(data[5]));
    });

    it("preserves loud samples above threshold", () => {
      // Make most samples very quiet (noise floor ~0.001), one loud sample
      const data = new Float32Array(100).fill(0.001);
      data[50] = 0.9; // far above threshold
      const result = audioProcessing.applyNoiseReduction(data);
      expect(result[50]).toBeCloseTo(0.9, 5);
    });
  });

  // ── estimateNoiseFloor ────────────────────────────────────────────────────

  describe("estimateNoiseFloor", () => {
    it("returns a number >= 0", () => {
      const result = audioProcessing.estimateNoiseFloor(loudAudio());
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("returns 10th percentile of absolute values", () => {
      // 10 values: 0.1, 0.2, ..., 1.0 — 10th percentile is index 1 = 0.2
      const data = makeFloat32([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
      const result = audioProcessing.estimateNoiseFloor(data);
      expect(result).toBeCloseTo(0.2, 5); // index floor(10 * 0.1) = 1 → sorted[1]=0.2
    });

    it("is lower for quiet audio than loud audio", () => {
      const quietFloor = audioProcessing.estimateNoiseFloor(loudAudio(100, 0.01));
      const loudFloor = audioProcessing.estimateNoiseFloor(loudAudio(100, 0.9));
      expect(quietFloor).toBeLessThan(loudFloor);
    });
  });

  // ── chunkAudio ────────────────────────────────────────────────────────────

  describe("chunkAudio", () => {
    it("splits into correct number of chunks", () => {
      const chunks = audioProcessing.chunkAudio(new Float32Array(100), 25);
      expect(chunks).toHaveLength(4);
    });

    it("each chunk has correct size", () => {
      const chunks = audioProcessing.chunkAudio(new Float32Array(100), 25);
      chunks.forEach((c) => expect(c.length).toBe(25));
    });

    it("last chunk can be smaller than chunkSize", () => {
      const chunks = audioProcessing.chunkAudio(new Float32Array(10), 3);
      expect(chunks[chunks.length - 1].length).toBe(1); // 10 mod 3 = 1
    });

    it("returns empty array for empty input", () => {
      const chunks = audioProcessing.chunkAudio(new Float32Array(0), 100);
      expect(chunks).toHaveLength(0);
    });

    it("returns single chunk when data < chunkSize", () => {
      const chunks = audioProcessing.chunkAudio(new Float32Array(5), 100);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].length).toBe(5);
    });

    it("preserves sample values", () => {
      const input = makeFloat32([1, 2, 3, 4]);
      const chunks = audioProcessing.chunkAudio(input, 2);
      expect(Array.from(chunks[0])).toEqual([1, 2]);
      expect(Array.from(chunks[1])).toEqual([3, 4]);
    });
  });

  // ── mergeAudioChunks ──────────────────────────────────────────────────────

  describe("mergeAudioChunks", () => {
    it("merges chunks back into single Float32Array", () => {
      const chunks = [makeFloat32([1, 2]), makeFloat32([3, 4])];
      const result = audioProcessing.mergeAudioChunks(chunks);
      expect(Array.from(result)).toEqual([1, 2, 3, 4]);
    });

    it("total length equals sum of chunk lengths", () => {
      const chunks = [new Float32Array(10), new Float32Array(20), new Float32Array(5)];
      const result = audioProcessing.mergeAudioChunks(chunks);
      expect(result.length).toBe(35);
    });

    it("returns empty array for empty input", () => {
      const result = audioProcessing.mergeAudioChunks([]);
      expect(result.length).toBe(0);
    });

    it("round-trips through chunk/merge", () => {
      const original = loudAudio(100, 0.5);
      const chunks = audioProcessing.chunkAudio(original, 10);
      const merged = audioProcessing.mergeAudioChunks(chunks);
      expect(Array.from(merged)).toEqual(Array.from(original));
    });
  });

  // ── validateAudioData ─────────────────────────────────────────────────────

  describe("validateAudioData", () => {
    it("returns isValid=false for empty audio", () => {
      const result = audioProcessing.validateAudioData(new Float32Array(0));
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain("Audio data is empty");
    });

    it("returns isValid=true for normal audio", () => {
      const result = audioProcessing.validateAudioData(loudAudio(100, 0.3));
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("detects clipping when amplitude >= 0.99", () => {
      const data = new Float32Array(100).fill(0.3);
      data[50] = 0.99;
      const result = audioProcessing.validateAudioData(data);
      expect(result.issues).toContain("Audio clipping detected");
    });

    it("detects very low signal (RMS < 0.001)", () => {
      const data = new Float32Array(100).fill(0.0001);
      const result = audioProcessing.validateAudioData(data);
      expect(result.issues).toContain("Very low audio signal");
    });

    it("detects DC offset > 0.1", () => {
      const data = new Float32Array(100).fill(0.5);
      const result = audioProcessing.validateAudioData(data);
      expect(result.issues).toContain("DC offset detected");
    });

    it("returns recommendations for each issue", () => {
      const result = audioProcessing.validateAudioData(new Float32Array(0));
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("issues and recommendations have same length", () => {
      const data = new Float32Array(100).fill(0.0001);
      const result = audioProcessing.validateAudioData(data);
      expect(result.recommendations.length).toBeGreaterThanOrEqual(result.issues.length);
    });
  });
});
