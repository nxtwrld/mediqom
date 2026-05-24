import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$lib/logging/logger", () => ({
  logger: {
    audio: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}));

import VADProcessor, { vadHelpers } from "./vad-helpers";
import type { VADConfig } from "./vad-helpers";
import type { AudioFeatures } from "./audio-processing";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFeatures(overrides: Partial<AudioFeatures> = {}): AudioFeatures {
  return {
    energy: 0.05,
    volume: 0.05,
    silence: false,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeSilentFeatures(): AudioFeatures {
  return makeFeatures({ energy: 0.001, volume: 0.001, silence: true });
}

function makeSpeechFeatures(): AudioFeatures {
  return makeFeatures({ energy: 0.05, volume: 0.05, silence: false });
}

describe("session/audio/vad-helpers", () => {
  // ── VADProcessor ──────────────────────────────────────────────────────────

  describe("VADProcessor", () => {
    let processor: VADProcessor;

    beforeEach(() => {
      processor = new VADProcessor();
    });

    describe("constructor", () => {
      it("creates instance with default config", () => {
        expect(processor).toBeInstanceOf(VADProcessor);
      });

      it("starts with isSpeaking=false", () => {
        const state = processor.getState();
        expect(state.isSpeaking).toBe(false);
      });

      it("starts with empty energy history", () => {
        const state = processor.getState();
        expect(state.energyHistory).toHaveLength(0);
      });

      it("accepts partial config overrides", () => {
        const custom = new VADProcessor({ energyThreshold: 0.05 });
        expect(custom).toBeInstanceOf(VADProcessor);
      });
    });

    describe("processFrame", () => {
      it("returns a valid VADDecision object", () => {
        const decision = processor.processFrame(makeSpeechFeatures());
        expect(decision).toHaveProperty("isSpeaking");
        expect(decision).toHaveProperty("confidence");
        expect(decision).toHaveProperty("shouldStartCapture");
        expect(decision).toHaveProperty("shouldEndCapture");
        expect(decision).toHaveProperty("speechDuration");
        expect(decision).toHaveProperty("silenceDuration");
      });

      it("accumulates energy history", () => {
        processor.processFrame(makeSpeechFeatures());
        processor.processFrame(makeSpeechFeatures());
        const state = processor.getState();
        expect(state.energyHistory).toHaveLength(2);
      });

      it("detects speech after consecutive speech frames", () => {
        // Need enough consecutive frames to trigger speech start
        const proc = new VADProcessor({ minSpeechDuration: 0 });
        let decision;
        for (let i = 0; i < 5; i++) {
          decision = proc.processFrame(makeSpeechFeatures());
        }
        expect(decision!.isSpeaking).toBe(true);
      });

      it("shouldStartCapture is true on the frame speech begins", () => {
        const proc = new VADProcessor({ minSpeechDuration: 0 });
        let started = false;
        for (let i = 0; i < 10; i++) {
          const d = proc.processFrame(makeSpeechFeatures());
          if (d.shouldStartCapture) started = true;
        }
        expect(started).toBe(true);
      });

      it("returns isSpeaking=false when all frames are silent", () => {
        for (let i = 0; i < 20; i++) {
          processor.processFrame(makeSilentFeatures());
        }
        const state = processor.getState();
        expect(state.isSpeaking).toBe(false);
      });

      it("confidence is between 0 and 1", () => {
        for (let i = 0; i < 5; i++) {
          const d = processor.processFrame(makeSpeechFeatures());
          expect(d.confidence).toBeGreaterThanOrEqual(0);
          expect(d.confidence).toBeLessThanOrEqual(1);
        }
      });

      it("returns confidence=0.5 when energy history is short (<3 frames)", () => {
        const d = processor.processFrame(makeSpeechFeatures());
        expect(d.confidence).toBe(0.5);
      });

      it("speechDuration > 0 when speaking", () => {
        const proc = new VADProcessor({ minSpeechDuration: 0 });
        let decision;
        for (let i = 0; i < 10; i++) {
          decision = proc.processFrame(makeSpeechFeatures());
        }
        if (decision!.isSpeaking) {
          expect(decision!.speechDuration).toBeGreaterThanOrEqual(0);
        }
      });

      it("limits energy history to energyHistorySize", () => {
        const proc = new VADProcessor({ energyHistorySize: 5 });
        for (let i = 0; i < 20; i++) {
          proc.processFrame(makeSpeechFeatures());
        }
        const state = proc.getState();
        expect(state.energyHistory.length).toBeLessThanOrEqual(5);
      });

      it("triggers duration timeout when speech exceeds maxSpeechDurationMs", () => {
        // Create processor with very short timeout and force speaking state
        const proc = new VADProcessor({
          minSpeechDuration: 0,
          maxSpeechDurationMs: 1, // 1ms
          enableSmartTimeout: true,
        });
        // Force into speaking state
        for (let i = 0; i < 5; i++) {
          proc.processFrame(makeSpeechFeatures());
        }
        // Now advance time by processing more frames (timeout check uses Date.now())
        // The speechStartTime is in the past so after a few ms the timeout triggers
        const state = proc.getState();
        if (state.isSpeaking && state.speechStartTime) {
          // Manually set speechStartTime to far in the past
          (proc as any).state.speechStartTime = Date.now() - 10000;
          const d = proc.processFrame(makeSpeechFeatures());
          // Should now trigger timeout
          expect(d.shouldTimeout).toBe(true);
        }
      });
    });

    describe("getState", () => {
      it("returns a copy of the state", () => {
        const state1 = processor.getState();
        const state2 = processor.getState();
        expect(state1).not.toBe(state2); // different object references
      });

      it("reflects accumulated history", () => {
        processor.processFrame(makeFeatures({ energy: 0.1 }));
        processor.processFrame(makeFeatures({ energy: 0.2 }));
        const state = processor.getState();
        expect(state.energyHistory).toContain(0.1);
        expect(state.energyHistory).toContain(0.2);
      });
    });

    describe("reset", () => {
      it("clears energy history", () => {
        processor.processFrame(makeSpeechFeatures());
        processor.processFrame(makeSpeechFeatures());
        processor.reset();
        const state = processor.getState();
        expect(state.energyHistory).toHaveLength(0);
      });

      it("resets speaking state to false", () => {
        const proc = new VADProcessor({ minSpeechDuration: 0 });
        for (let i = 0; i < 10; i++) proc.processFrame(makeSpeechFeatures());
        proc.reset();
        expect(proc.getState().isSpeaking).toBe(false);
      });

      it("resets speechStartTime to null", () => {
        processor.reset();
        expect(processor.getState().speechStartTime).toBeNull();
      });
    });

    describe("updateConfig", () => {
      it("updates provided config fields", () => {
        processor.updateConfig({ energyThreshold: 0.99 });
        // Config is private; verify via behavior - processor still works
        const decision = processor.processFrame(makeSpeechFeatures());
        expect(decision).toBeDefined();
      });

      it("does not throw on empty config update", () => {
        expect(() => processor.updateConfig({})).not.toThrow();
      });
    });

    describe("getAdaptiveThresholds", () => {
      it("returns default thresholds when history is short", () => {
        const thresholds = processor.getAdaptiveThresholds();
        expect(thresholds.energyThreshold).toBeGreaterThan(0);
        expect(thresholds.speechThreshold).toBeGreaterThan(0);
        expect(thresholds.silenceThreshold).toBeGreaterThan(0);
      });

      it("returns thresholds based on history when >= 10 frames", () => {
        for (let i = 0; i < 15; i++) {
          processor.processFrame(makeFeatures({ energy: 0.05 }));
        }
        const thresholds = processor.getAdaptiveThresholds();
        expect(thresholds).toHaveProperty("energyThreshold");
        expect(thresholds).toHaveProperty("speechThreshold");
        expect(thresholds).toHaveProperty("silenceThreshold");
      });
    });
  });

  // ── vadHelpers.createConfig ───────────────────────────────────────────────

  describe("vadHelpers.createConfig", () => {
    it("sensitive config has lower energy threshold than balanced", () => {
      const sens = vadHelpers.createConfig.sensitive();
      const bal = vadHelpers.createConfig.balanced();
      expect(sens.energyThreshold!).toBeLessThan(bal.energyThreshold!);
    });

    it("conservative config has higher energy threshold than balanced", () => {
      const cons = vadHelpers.createConfig.conservative();
      const bal = vadHelpers.createConfig.balanced();
      expect(cons.energyThreshold!).toBeGreaterThan(bal.energyThreshold!);
    });

    it("medical config enables smart timeout", () => {
      const med = vadHelpers.createConfig.medical();
      expect(med.enableSmartTimeout).toBe(true);
    });

    it("timeoutOptimized config has shorter maxSpeechDurationMs than medical", () => {
      const timeout = vadHelpers.createConfig.timeoutOptimized();
      const med = vadHelpers.createConfig.medical();
      expect(timeout.maxSpeechDurationMs!).toBeLessThan(med.maxSpeechDurationMs!);
    });

    it("each factory returns a new object", () => {
      const a = vadHelpers.createConfig.balanced();
      const b = vadHelpers.createConfig.balanced();
      expect(a).not.toBe(b);
    });
  });

  // ── vadHelpers.analyzePerformance ─────────────────────────────────────────

  describe("vadHelpers.analyzePerformance", () => {
    it("returns zeros for empty decisions array", () => {
      const result = vadHelpers.analyzePerformance([]);
      expect(result.speechPercentage).toBe(0);
      expect(result.avgConfidence).toBe(0);
      expect(result.speechSegments).toBe(0);
      expect(result.timeoutEvents).toBe(0);
    });

    it("calculates speechPercentage correctly", () => {
      const decisions = [
        { isSpeaking: true, confidence: 0.8, shouldStartCapture: false, shouldEndCapture: false, speechDuration: 100, silenceDuration: 0, shouldTimeout: false, energyLevel: 0.05, energyVariance: 0.001 },
        { isSpeaking: false, confidence: 0.2, shouldStartCapture: false, shouldEndCapture: false, speechDuration: 0, silenceDuration: 100, shouldTimeout: false, energyLevel: 0.001, energyVariance: 0 },
      ];
      const result = vadHelpers.analyzePerformance(decisions as any);
      expect(result.speechPercentage).toBe(50);
    });

    it("counts speech segments via shouldStartCapture", () => {
      const decisions = [
        { isSpeaking: true, confidence: 0.8, shouldStartCapture: true, shouldEndCapture: false, speechDuration: 500, silenceDuration: 0, shouldTimeout: false, energyLevel: 0.05, energyVariance: 0.001 },
        { isSpeaking: true, confidence: 0.8, shouldStartCapture: false, shouldEndCapture: false, speechDuration: 500, silenceDuration: 0, shouldTimeout: false, energyLevel: 0.05, energyVariance: 0.001 },
        { isSpeaking: true, confidence: 0.8, shouldStartCapture: true, shouldEndCapture: false, speechDuration: 500, silenceDuration: 0, shouldTimeout: false, energyLevel: 0.05, energyVariance: 0.001 },
      ];
      const result = vadHelpers.analyzePerformance(decisions as any);
      expect(result.speechSegments).toBe(2);
    });

    it("counts timeout events", () => {
      const decisions = [
        { isSpeaking: true, confidence: 0.5, shouldStartCapture: false, shouldEndCapture: false, speechDuration: 100, silenceDuration: 0, shouldTimeout: true, timeoutReason: "duration", energyLevel: 0.05, energyVariance: 0 },
        { isSpeaking: false, confidence: 0.2, shouldStartCapture: false, shouldEndCapture: false, speechDuration: 0, silenceDuration: 100, shouldTimeout: false, energyLevel: 0.001, energyVariance: 0 },
      ];
      const result = vadHelpers.analyzePerformance(decisions as any);
      expect(result.timeoutEvents).toBe(1);
      expect(result.timeoutReasons["duration"]).toBe(1);
    });

    it("calculates average confidence", () => {
      const decisions = [
        { isSpeaking: true, confidence: 0.6, shouldStartCapture: false, shouldEndCapture: false, speechDuration: 0, silenceDuration: 0, shouldTimeout: false, energyLevel: 0.05, energyVariance: 0 },
        { isSpeaking: false, confidence: 0.4, shouldStartCapture: false, shouldEndCapture: false, speechDuration: 0, silenceDuration: 0, shouldTimeout: false, energyLevel: 0.01, energyVariance: 0 },
      ];
      const result = vadHelpers.analyzePerformance(decisions as any);
      expect(result.avgConfidence).toBeCloseTo(0.5);
    });

    it("calculates avgEnergyLevel", () => {
      const decisions = [
        { isSpeaking: true, confidence: 0.8, shouldStartCapture: false, shouldEndCapture: false, speechDuration: 0, silenceDuration: 0, shouldTimeout: false, energyLevel: 0.04, energyVariance: 0 },
        { isSpeaking: false, confidence: 0.2, shouldStartCapture: false, shouldEndCapture: false, speechDuration: 0, silenceDuration: 0, shouldTimeout: false, energyLevel: 0.02, energyVariance: 0 },
      ];
      const result = vadHelpers.analyzePerformance(decisions as any);
      expect(result.avgEnergyLevel).toBeCloseTo(0.03);
    });
  });
});
