import { logger } from "$lib/logging/logger";

/**
 * Audio processing utilities for session recording
 */

export interface AudioProcessingOptions {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  chunkSize?: number;
}

export interface AudioFeatures {
  energy: number;
  pitch?: number;
  volume: number;
  silence: boolean;
  timestamp: number;
}

export const audioProcessing = {
  /**
   * Convert Float32Array audio data to different formats
   */
  convertAudioFormat: {
    /**
     * Convert to PCM 16-bit
     */
    toPCM16(float32Data: Float32Array): Int16Array {
      const pcm16 = new Int16Array(float32Data.length);
      for (let i = 0; i < float32Data.length; i++) {
        // Convert float32 (-1 to 1) to int16 (-32768 to 32767)
        pcm16[i] = Math.max(
          -32768,
          Math.min(32767, Math.floor(float32Data[i] * 32768)),
        );
      }
      return pcm16;
    },

    /**
     * Convert to WAV blob
     */
    toWAVBlob(float32Data: Float32Array, sampleRate: number = 16000): Blob {
      const pcm16 = audioProcessing.convertAudioFormat.toPCM16(float32Data);
      const buffer = audioProcessing.createWAVBuffer(pcm16, sampleRate);
      return new Blob([buffer], { type: "audio/wav" });
    },

    /**
     * Resample audio data
     */
    resample(
      inputData: Float32Array,
      inputRate: number,
      outputRate: number,
    ): Float32Array {
      if (inputRate === outputRate) return inputData;

      const ratio = inputRate / outputRate;
      const outputLength = Math.round(inputData.length / ratio);
      const output = new Float32Array(outputLength);

      for (let i = 0; i < outputLength; i++) {
        const inputIndex = i * ratio;
        const index = Math.floor(inputIndex);
        const fraction = inputIndex - index;

        if (index + 1 < inputData.length) {
          // Linear interpolation
          output[i] =
            inputData[index] * (1 - fraction) + inputData[index + 1] * fraction;
        } else {
          output[i] = inputData[index];
        }
      }

      return output;
    },
  },

  /**
   * Create WAV file buffer from PCM data
   */
  createWAVBuffer(pcmData: Int16Array, sampleRate: number): ArrayBuffer {
    const length = pcmData.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, length * 2, true);

    // PCM data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      view.setInt16(offset, pcmData[i], true);
      offset += 2;
    }

    return buffer;
  },

  /**
   * Extract audio features for analysis
   */
  extractFeatures(audioData: Float32Array): AudioFeatures {
    if (audioData.length === 0) {
      return {
        energy: 0,
        volume: 0,
        silence: true,
        timestamp: Date.now(),
      };
    }

    // Calculate RMS energy
    let sumSquares = 0;
    let maxAmplitude = 0;

    for (let i = 0; i < audioData.length; i++) {
      const sample = audioData[i];
      sumSquares += sample * sample;
      maxAmplitude = Math.max(maxAmplitude, Math.abs(sample));
    }

    const rmsEnergy = Math.sqrt(sumSquares / audioData.length);
    const volume = maxAmplitude;

    // Silence detection (threshold can be adjusted)
    const silenceThreshold = 0.01;
    const silence = rmsEnergy < silenceThreshold;

    return {
      energy: rmsEnergy,
      volume,
      silence,
      timestamp: Date.now(),
    };
  },

  /**
   * Apply audio filters and preprocessing
   */
  preprocess(
    audioData: Float32Array,
    options: {
      normalize?: boolean;
      highPassFilter?: boolean;
      noiseReduction?: boolean;
    } = {},
  ): Float32Array {
    let processedData = new Float32Array(audioData);

    // Normalize audio levels
    if (options.normalize !== false) {
      const maxAmplitude = Math.max(...Array.from(audioData).map(Math.abs));
      if (maxAmplitude > 0) {
        const scaleFactor = 0.95 / maxAmplitude;
        processedData = processedData.map((sample) => sample * scaleFactor);
      }
    }

    // Simple high-pass filter (removes low-frequency noise)
    if (options.highPassFilter) {
      processedData = audioProcessing.applyHighPassFilter(processedData) as Float32Array<ArrayBuffer>;
    }

    // Basic noise reduction (spectral subtraction)
    if (options.noiseReduction) {
      processedData = audioProcessing.applyNoiseReduction(processedData) as Float32Array<ArrayBuffer>;
    }

    return processedData;
  },

  /**
   * Apply simple high-pass filter
   */
  applyHighPassFilter(
    audioData: Float32Array,
    alpha: number = 0.97,
  ): Float32Array {
    const filtered = new Float32Array(audioData.length);
    filtered[0] = audioData[0];

    for (let i = 1; i < audioData.length; i++) {
      filtered[i] = alpha * (filtered[i - 1] + audioData[i] - audioData[i - 1]);
    }

    return filtered;
  },

  /**
   * Apply basic noise reduction
   */
  applyNoiseReduction(audioData: Float32Array): Float32Array {
    // Simple noise gate approach
    const noiseFloor = audioProcessing.estimateNoiseFloor(audioData);
    const threshold = noiseFloor * 2;

    return audioData.map((sample) => {
      return Math.abs(sample) > threshold ? sample : sample * 0.1;
    });
  },

  /**
   * Estimate noise floor from audio data
   */
  estimateNoiseFloor(audioData: Float32Array): number {
    const sortedAmplitudes = Array.from(audioData)
      .map(Math.abs)
      .sort((a, b) => a - b);

    // Use 10th percentile as noise floor estimate
    const percentileIndex = Math.floor(sortedAmplitudes.length * 0.1);
    return sortedAmplitudes[percentileIndex];
  },

  /**
   * Split audio into chunks for processing
   */
  chunkAudio(audioData: Float32Array, chunkSize: number): Float32Array[] {
    const chunks: Float32Array[] = [];

    for (let i = 0; i < audioData.length; i += chunkSize) {
      const chunk = audioData.slice(i, i + chunkSize);
      chunks.push(chunk);
    }

    return chunks;
  },

  /**
   * Merge audio chunks back together
   */
  mergeAudioChunks(chunks: Float32Array[]): Float32Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return merged;
  },

  /**
   * Validate audio data quality
   */
  validateAudioData(audioData: Float32Array): {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (audioData.length === 0) {
      issues.push("Audio data is empty");
      recommendations.push("Check microphone connection and permissions");
    }

    // Check for clipping
    const maxAmplitude = Math.max(...Array.from(audioData).map(Math.abs));
    if (maxAmplitude >= 0.99) {
      issues.push("Audio clipping detected");
      recommendations.push("Reduce microphone input gain");
    }

    // Check for very low signal
    const rms = Math.sqrt(
      audioData.reduce((sum, sample) => sum + sample * sample, 0) /
        audioData.length,
    );
    if (rms < 0.001) {
      issues.push("Very low audio signal");
      recommendations.push("Check microphone positioning and sensitivity");
    }

    // Check for DC offset
    const dcOffset =
      audioData.reduce((sum, sample) => sum + sample, 0) / audioData.length;
    if (Math.abs(dcOffset) > 0.1) {
      issues.push("DC offset detected");
      recommendations.push("Use high-pass filter or check microphone hardware");
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations,
    };
  },
};

export default audioProcessing;
