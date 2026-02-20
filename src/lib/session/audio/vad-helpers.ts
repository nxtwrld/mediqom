import { logger } from "$lib/logging/logger";
import type { AudioFeatures } from "./audio-processing";

/**
 * Voice Activity Detection (VAD) helpers and utilities
 */

export interface VADConfig {
  energyThreshold?: number;
  silenceThreshold?: number;
  speechThreshold?: number;
  minSpeechDuration?: number;
  maxSilenceDuration?: number;
  lookAheadFrames?: number;
  lookBackFrames?: number;

  // Timeout and overlap settings for stuck VAD prevention
  maxSpeechDurationMs?: number; // Maximum speech duration before forced timeout
  overlapDurationMs?: number; // Overlap duration for chunk continuity
  enableSmartTimeout?: boolean; // Enable energy-based smart timeout detection
  energyHistorySize?: number; // Number of energy frames to keep for analysis
  timeoutEnergyThreshold?: number; // Energy threshold for timeout detection
  timeoutVarianceThreshold?: number; // Variance threshold for consistent noise detection
}

export interface VADState {
  isSpeaking: boolean;
  speechStartTime: number | null;
  speechEndTime: number | null;
  silenceStartTime: number | null;
  consecutiveSpeechFrames: number;
  consecutiveSilenceFrames: number;
  energyHistory: number[];
  volumeHistory: number[];

  // Extended state for timeout detection
  lastTimeoutCheck: number;
  timeoutTriggered: boolean;
  energyVarianceHistory: number[];
}

export interface VADDecision {
  isSpeaking: boolean;
  confidence: number;
  shouldStartCapture: boolean;
  shouldEndCapture: boolean;
  speechDuration: number;
  silenceDuration: number;

  // Extended decision data for timeout handling
  shouldTimeout: boolean;
  timeoutReason?: "duration" | "energy_pattern" | "variance_pattern";
  energyLevel: number;
  energyVariance: number;
}

export class VADProcessor {
  private config: Required<VADConfig>;
  private state: VADState;
  private readonly frameSize: number = 160; // 10ms at 16kHz

  constructor(config: VADConfig = {}) {
    this.config = {
      energyThreshold: config.energyThreshold ?? 0.01,
      silenceThreshold: config.silenceThreshold ?? 0.005,
      speechThreshold: config.speechThreshold ?? 0.02,
      minSpeechDuration: config.minSpeechDuration ?? 300, // 300ms
      maxSilenceDuration: config.maxSilenceDuration ?? 1000, // 1000ms
      lookAheadFrames: config.lookAheadFrames ?? 3,
      lookBackFrames: config.lookBackFrames ?? 5,

      // Timeout and overlap settings
      maxSpeechDurationMs: config.maxSpeechDurationMs ?? 30000, // 30 seconds
      overlapDurationMs: config.overlapDurationMs ?? 5000, // 5 seconds
      enableSmartTimeout: config.enableSmartTimeout ?? true,
      energyHistorySize: config.energyHistorySize ?? 50,
      timeoutEnergyThreshold: config.timeoutEnergyThreshold ?? 0.001,
      timeoutVarianceThreshold: config.timeoutVarianceThreshold ?? 0.0001,
    };

    this.state = this.initializeState();
  }

  private initializeState(): VADState {
    return {
      isSpeaking: false,
      speechStartTime: null,
      speechEndTime: null,
      silenceStartTime: null,
      consecutiveSpeechFrames: 0,
      consecutiveSilenceFrames: 0,
      energyHistory: [],
      volumeHistory: [],

      // Extended state for timeout detection
      lastTimeoutCheck: Date.now(),
      timeoutTriggered: false,
      energyVarianceHistory: [],
    };
  }

  /**
   * Process audio frame and return VAD decision
   */
  processFrame(features: AudioFeatures): VADDecision {
    const now = Date.now();

    // Update history
    this.state.energyHistory.push(features.energy);
    this.state.volumeHistory.push(features.volume);

    // Keep energy history limited for timeout detection
    if (this.state.energyHistory.length > this.config.energyHistorySize) {
      this.state.energyHistory.shift();
    }
    if (this.state.volumeHistory.length > this.config.energyHistorySize) {
      this.state.volumeHistory.shift();
    }

    // Calculate energy variance for timeout detection
    const energyVariance = this.calculateEnergyVariance();
    this.state.energyVarianceHistory.push(energyVariance);
    if (this.state.energyVarianceHistory.length > 10) {
      this.state.energyVarianceHistory.shift();
    }

    // Determine if current frame contains speech
    const frameHasSpeech = this.detectSpeechInFrame(features);

    // Update consecutive frame counters
    if (frameHasSpeech) {
      this.state.consecutiveSpeechFrames++;
      this.state.consecutiveSilenceFrames = 0;
    } else {
      this.state.consecutiveSpeechFrames = 0;
      this.state.consecutiveSilenceFrames++;
    }

    // Previous state
    const wasSpeaking = this.state.isSpeaking;

    // Check for timeout conditions
    const timeoutDecision = this.checkTimeoutConditions(features, now);

    // Decision logic with hysteresis and timeout
    const shouldStartSpeaking =
      !timeoutDecision.shouldTimeout &&
      this.shouldStartSpeaking(frameHasSpeech, now);
    const shouldStopSpeaking =
      timeoutDecision.shouldTimeout ||
      this.shouldStopSpeaking(frameHasSpeech, now);

    // Update speaking state
    if (!wasSpeaking && shouldStartSpeaking) {
      this.state.isSpeaking = true;
      this.state.speechStartTime = now;
      this.state.silenceStartTime = null;
      this.state.timeoutTriggered = false;
      logger.audio.debug("VAD: Speech started");
    } else if (wasSpeaking && shouldStopSpeaking) {
      this.state.isSpeaking = false;
      this.state.speechEndTime = now;
      this.state.silenceStartTime = now;
      if (timeoutDecision.shouldTimeout) {
        this.state.timeoutTriggered = true;
        logger.audio.warn("VAD: Speech ended due to timeout", {
          reason: timeoutDecision.timeoutReason,
          duration: now - (this.state.speechStartTime || now),
        });
      } else {
        logger.audio.debug("VAD: Speech ended naturally");
      }
    }

    // Calculate durations
    const speechDuration =
      this.state.isSpeaking && this.state.speechStartTime
        ? now - this.state.speechStartTime
        : 0;
    const silenceDuration =
      !this.state.isSpeaking && this.state.silenceStartTime
        ? now - this.state.silenceStartTime
        : 0;

    // Calculate confidence
    const confidence = this.calculateConfidence(features);

    return {
      isSpeaking: this.state.isSpeaking,
      confidence,
      shouldStartCapture: !wasSpeaking && this.state.isSpeaking,
      shouldEndCapture: wasSpeaking && !this.state.isSpeaking,
      speechDuration,
      silenceDuration,
      shouldTimeout: timeoutDecision.shouldTimeout,
      timeoutReason: timeoutDecision.timeoutReason,
      energyLevel: features.energy,
      energyVariance,
    };
  }

  /**
   * Detect if current frame contains speech
   */
  private detectSpeechInFrame(features: AudioFeatures): boolean {
    // Multi-criteria speech detection
    const energyCriteria = features.energy > this.config.energyThreshold;
    const volumeCriteria = features.volume > this.config.speechThreshold;
    const silenceCriteria = !features.silence;

    // Combine criteria (at least 2 out of 3 should be true)
    const criteriaCount = [
      energyCriteria,
      volumeCriteria,
      silenceCriteria,
    ].filter(Boolean).length;

    return criteriaCount >= 2;
  }

  /**
   * Determine if speech should start
   */
  private shouldStartSpeaking(frameHasSpeech: boolean, now: number): boolean {
    if (this.state.isSpeaking) return false;

    // Require minimum consecutive speech frames
    const minConsecutiveFrames = Math.ceil(this.config.minSpeechDuration / 100); // frames per 100ms

    return (
      frameHasSpeech &&
      this.state.consecutiveSpeechFrames >= Math.min(minConsecutiveFrames, 3)
    );
  }

  /**
   * Determine if speech should stop
   */
  private shouldStopSpeaking(frameHasSpeech: boolean, now: number): boolean {
    if (!this.state.isSpeaking) return false;

    // Check minimum speech duration
    if (
      this.state.speechStartTime &&
      now - this.state.speechStartTime < this.config.minSpeechDuration
    ) {
      return false;
    }

    // Require minimum consecutive silence frames
    const minSilenceFrames = Math.ceil(this.config.maxSilenceDuration / 100);

    return (
      !frameHasSpeech &&
      this.state.consecutiveSilenceFrames >= Math.min(minSilenceFrames, 10)
    );
  }

  /**
   * Calculate confidence score for VAD decision
   */
  private calculateConfidence(features: AudioFeatures): number {
    if (this.state.energyHistory.length < 3) return 0.5;

    // Calculate signal-to-noise ratio estimate
    const recentEnergy = this.state.energyHistory.slice(-3);
    const avgRecentEnergy =
      recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length;

    const historicalEnergy = this.state.energyHistory.slice(0, -3);
    const avgHistoricalEnergy =
      historicalEnergy.length > 0
        ? historicalEnergy.reduce((a, b) => a + b, 0) / historicalEnergy.length
        : avgRecentEnergy;

    // SNR-based confidence
    const snr =
      avgHistoricalEnergy > 0 ? avgRecentEnergy / avgHistoricalEnergy : 1;
    const snrConfidence = Math.min(1, Math.max(0, (snr - 0.5) * 2));

    // Energy-based confidence
    const energyConfidence = Math.min(
      1,
      features.energy / this.config.speechThreshold,
    );

    // Volume-based confidence
    const volumeConfidence = Math.min(
      1,
      features.volume / this.config.speechThreshold,
    );

    // Weighted combination
    return (
      snrConfidence * 0.4 + energyConfidence * 0.3 + volumeConfidence * 0.3
    );
  }

  /**
   * Get current VAD state
   */
  getState(): VADState {
    return { ...this.state };
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.state = this.initializeState();
    logger.audio.debug("VAD state reset", {
      timeoutTriggered: this.state.timeoutTriggered,
      energyHistorySize: this.state.energyHistory.length,
    });
  }

  /**
   * Update VAD configuration
   */
  updateConfig(newConfig: Partial<VADConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.audio.debug("VAD config updated:", {
      ...newConfig,
      timeoutEnabled: this.config.enableSmartTimeout,
      maxSpeechDuration: `${this.config.maxSpeechDurationMs}ms`,
      overlapDuration: `${this.config.overlapDurationMs}ms`,
    });
  }

  /**
   * Calculate energy variance for timeout detection
   */
  private calculateEnergyVariance(): number {
    if (this.state.energyHistory.length < 5) return 0;

    const recentEnergies = this.state.energyHistory.slice(-10);
    const mean =
      recentEnergies.reduce((a, b) => a + b, 0) / recentEnergies.length;

    const variance =
      recentEnergies.reduce((acc, energy) => {
        return acc + Math.pow(energy - mean, 2);
      }, 0) / recentEnergies.length;

    return variance;
  }

  /**
   * Check for timeout conditions based on duration and energy patterns
   */
  private checkTimeoutConditions(
    features: AudioFeatures,
    now: number,
  ): {
    shouldTimeout: boolean;
    timeoutReason?: "duration" | "energy_pattern" | "variance_pattern";
  } {
    if (
      !this.config.enableSmartTimeout ||
      !this.state.isSpeaking ||
      !this.state.speechStartTime
    ) {
      return { shouldTimeout: false };
    }

    const speechDuration = now - this.state.speechStartTime;

    // Duration-based timeout
    if (speechDuration > this.config.maxSpeechDurationMs) {
      return {
        shouldTimeout: true,
        timeoutReason: "duration",
      };
    }

    // Only check energy patterns after minimum speech duration
    if (speechDuration < 5000 || this.state.energyHistory.length < 10) {
      return { shouldTimeout: false };
    }

    // Energy-based timeout (sustained low energy indicating stuck VAD)
    const recentEnergies = this.state.energyHistory.slice(-10);
    const avgRecentEnergy =
      recentEnergies.reduce((a, b) => a + b, 0) / recentEnergies.length;

    if (avgRecentEnergy < this.config.timeoutEnergyThreshold) {
      return {
        shouldTimeout: true,
        timeoutReason: "energy_pattern",
      };
    }

    // Variance-based timeout (consistent noise pattern)
    const energyVariance = this.calculateEnergyVariance();
    if (
      energyVariance < this.config.timeoutVarianceThreshold &&
      avgRecentEnergy > 0.0005
    ) {
      return {
        shouldTimeout: true,
        timeoutReason: "variance_pattern",
      };
    }

    return { shouldTimeout: false };
  }

  /**
   * Get adaptive thresholds based on environment
   */
  getAdaptiveThresholds(): {
    energyThreshold: number;
    speechThreshold: number;
    silenceThreshold: number;
  } {
    if (this.state.energyHistory.length < 10) {
      return {
        energyThreshold: this.config.energyThreshold,
        speechThreshold: this.config.speechThreshold,
        silenceThreshold: this.config.silenceThreshold,
      };
    }

    // Calculate adaptive thresholds based on recent history
    const sortedEnergies = [...this.state.energyHistory].sort((a, b) => a - b);
    const median = sortedEnergies[Math.floor(sortedEnergies.length / 2)];
    const percentile75 =
      sortedEnergies[Math.floor(sortedEnergies.length * 0.75)];
    const percentile25 =
      sortedEnergies[Math.floor(sortedEnergies.length * 0.25)];

    return {
      energyThreshold: Math.max(
        this.config.energyThreshold,
        percentile25 * 1.5,
      ),
      speechThreshold: Math.max(this.config.speechThreshold, median * 1.2),
      silenceThreshold: Math.min(
        this.config.silenceThreshold,
        percentile25 * 0.8,
      ),
    };
  }
}

/**
 * VAD utility functions
 */
export const vadHelpers = {
  /**
   * Create optimized VAD configuration for different use cases
   */
  createConfig: {
    // Sensitive - catches more speech but may have false positives
    sensitive: (): VADConfig => ({
      energyThreshold: 0.005,
      silenceThreshold: 0.003,
      speechThreshold: 0.01,
      minSpeechDuration: 200,
      maxSilenceDuration: 800,
      lookAheadFrames: 5,
      lookBackFrames: 7,
    }),

    // Balanced - good compromise between accuracy and responsiveness
    balanced: (): VADConfig => ({
      energyThreshold: 0.01,
      silenceThreshold: 0.005,
      speechThreshold: 0.02,
      minSpeechDuration: 300,
      maxSilenceDuration: 1000,
      lookAheadFrames: 3,
      lookBackFrames: 5,
    }),

    // Conservative - fewer false positives but may miss quiet speech
    conservative: (): VADConfig => ({
      energyThreshold: 0.02,
      silenceThreshold: 0.01,
      speechThreshold: 0.03,
      minSpeechDuration: 400,
      maxSilenceDuration: 1200,
      lookAheadFrames: 2,
      lookBackFrames: 3,
    }),

    // Medical - optimized for medical consultations with timeout protection
    medical: (): VADConfig => ({
      energyThreshold: 0.008,
      silenceThreshold: 0.004,
      speechThreshold: 0.015,
      minSpeechDuration: 250,
      maxSilenceDuration: 900,
      lookAheadFrames: 4,
      lookBackFrames: 6,

      // Medical consultation optimized timeout settings
      maxSpeechDurationMs: 45000, // 45 seconds for longer medical explanations
      overlapDurationMs: 5000, // 5 seconds overlap
      enableSmartTimeout: true,
      energyHistorySize: 60, // Larger history for medical context
      timeoutEnergyThreshold: 0.0008, // Lower threshold for quiet speech
      timeoutVarianceThreshold: 0.00008, // Tighter variance for medical precision
    }),

    // Timeout-focused - prioritizes preventing stuck VAD events
    timeoutOptimized: (): VADConfig => ({
      energyThreshold: 0.01,
      silenceThreshold: 0.005,
      speechThreshold: 0.02,
      minSpeechDuration: 300,
      maxSilenceDuration: 1000,
      lookAheadFrames: 3,
      lookBackFrames: 5,

      // Aggressive timeout settings
      maxSpeechDurationMs: 20000, // 20 seconds maximum
      overlapDurationMs: 3000, // 3 seconds overlap
      enableSmartTimeout: true,
      energyHistorySize: 30,
      timeoutEnergyThreshold: 0.002, // Higher threshold for quicker timeout
      timeoutVarianceThreshold: 0.0002, // Looser variance for faster detection
    }),
  },

  /**
   * Analyze VAD performance metrics including timeout statistics
   */
  analyzePerformance(decisions: VADDecision[]): {
    speechPercentage: number;
    avgConfidence: number;
    speechSegments: number;
    avgSpeechDuration: number;
    avgSilenceDuration: number;
    timeoutEvents: number;
    timeoutReasons: Record<string, number>;
    avgEnergyLevel: number;
    avgEnergyVariance: number;
  } {
    if (decisions.length === 0) {
      return {
        speechPercentage: 0,
        avgConfidence: 0,
        speechSegments: 0,
        avgSpeechDuration: 0,
        avgSilenceDuration: 0,
        timeoutEvents: 0,
        timeoutReasons: {},
        avgEnergyLevel: 0,
        avgEnergyVariance: 0,
      };
    }

    const speechFrames = decisions.filter((d) => d.isSpeaking).length;
    const speechPercentage = (speechFrames / decisions.length) * 100;

    const avgConfidence =
      decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length;

    const speechSegments = decisions.filter((d) => d.shouldStartCapture).length;

    // Timeout analysis
    const timeoutEvents = decisions.filter((d) => d.shouldTimeout).length;
    const timeoutReasons: Record<string, number> = {};
    decisions.forEach((d) => {
      if (d.shouldTimeout && d.timeoutReason) {
        timeoutReasons[d.timeoutReason] =
          (timeoutReasons[d.timeoutReason] || 0) + 1;
      }
    });

    // Energy analysis
    const avgEnergyLevel =
      decisions.reduce((sum, d) => sum + d.energyLevel, 0) / decisions.length;
    const avgEnergyVariance =
      decisions.reduce((sum, d) => sum + d.energyVariance, 0) /
      decisions.length;

    const speechDurations = decisions
      .filter((d) => d.speechDuration > 0)
      .map((d) => d.speechDuration);
    const avgSpeechDuration =
      speechDurations.length > 0
        ? speechDurations.reduce((a, b) => a + b, 0) / speechDurations.length
        : 0;

    const silenceDurations = decisions
      .filter((d) => d.silenceDuration > 0)
      .map((d) => d.silenceDuration);
    const avgSilenceDuration =
      silenceDurations.length > 0
        ? silenceDurations.reduce((a, b) => a + b, 0) / silenceDurations.length
        : 0;

    return {
      speechPercentage,
      avgConfidence,
      speechSegments,
      avgSpeechDuration,
      avgSilenceDuration,
      timeoutEvents,
      timeoutReasons,
      avgEnergyLevel,
      avgEnergyVariance,
    };
  },
};

export default VADProcessor;
