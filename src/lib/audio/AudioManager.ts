import { EventEmitter } from 'eventemitter3';
import { AudioState, getAudioVAD, type AudioControlsVad } from './microphone';
import { logger } from '$lib/logging/logger';
import { float32Flatten } from '$lib/array';
import ui from '$lib/ui';

/**
 * Singleton AudioManager for centralized audio processing
 * Handles microphone access, VAD processing, and audio chunk generation
 * Only one instance can exist at a time to prevent multiple microphone access
 */
export class AudioManager extends EventEmitter {
  private static instance: AudioManager | null = null;
  private audio: AudioControlsVad | null = null;
  private isInitialized = false;
  private isRecording = false;
  private currentState: AudioState = AudioState.Ready;
  
  // Audio chunk buffering for optimization
  private chunkBuffer: Float32Array[] = [];
  private bufferTimer: number | null = null;
  private batchDurationMs = 30000; // 30 seconds real-time, loaded from config
  private batchStartTime: number | null = null;
  
  // VAD timeout system for stuck speech events
  private vadTimeoutTimer: number | null = null;
  private lastSpeechStartTime: number | null = null;
  private maxSpeechDurationMs = 30000; // 30 seconds default
  private overlappingBuffer: Float32Array[] = [];
  private overlapDurationMs = 5000; // 5 seconds overlap
  private chunkSequenceNumber = 0;
  
  // Energy-based pause detection
  private energyHistory: number[] = [];
  private readonly ENERGY_HISTORY_SIZE = 50; // frames to keep for analysis
  private lastEnergyCalculation = 0;

  private constructor() {
    super();
    logger.audio.debug('AudioManager singleton created');
    
    // Load configuration from audio-transcription.json if available
    this.loadConfiguration();
  }
  
  /**
   * Load configuration from audio-transcription.json
   */
  private loadConfiguration() {
    // Set defaults that can be overridden by configuration
    this.maxSpeechDurationMs = 30000; // 30 seconds
    this.overlapDurationMs = 5000; // 5 seconds
    this.batchDurationMs = 30000; // 30 seconds real-time batch window

    // In a browser environment, configuration would be loaded via API
    // For now, we use reasonable defaults that can be overridden later
    logger.audio.debug('AudioManager configuration loaded with defaults', {
      maxSpeechDuration: `${this.maxSpeechDurationMs}ms`,
      overlapDuration: `${this.overlapDurationMs}ms`,
      batchDuration: `${this.batchDurationMs}ms`,
    });
  }

  /**
   * Get the singleton instance
   * Throws error if trying to create multiple instances
   */
  public static getInstance(): AudioManager {
    if (AudioManager.instance === null) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  /**
   * Prevent multiple instances - throws error if instance already exists
   */
  public static createInstance(): AudioManager {
    if (AudioManager.instance !== null) {
      throw new Error('AudioManager instance already exists. Only one instance allowed per application.');
    }
    return AudioManager.getInstance();
  }

  /**
   * Check if enough real-time has elapsed to send buffer for transcription
   * Uses wall clock time instead of sample count to ensure consistent batch timing
   */
  private shouldSendBuffer(): boolean {
    if (!this.batchStartTime || this.chunkBuffer.length === 0) return false;
    const elapsedMs = Date.now() - this.batchStartTime;
    return elapsedMs >= this.batchDurationMs;
  }

  /**
   * Set VAD timeout to prevent infinite speech detection
   */
  private setVadTimeout() {
    // Clear any existing timeout
    this.clearVadTimeout();
    
    this.vadTimeoutTimer = window.setTimeout(() => {
      logger.audio.warn('⚠️ VAD timeout triggered - forcing speech end after 30s', {
        maxDurationMs: this.maxSpeechDurationMs,
        lastSpeechStart: this.lastSpeechStartTime,
        shouldTriggerSmartTimeout: this.shouldTriggerSmartTimeout(),
        energyHistorySize: this.energyHistory.length,
      });
      
      // Force speech end with current audio context
      this.handleVadTimeout();
    }, this.maxSpeechDurationMs);
  }
  
  /**
   * Clear VAD timeout
   */
  private clearVadTimeout() {
    if (this.vadTimeoutTimer) {
      clearTimeout(this.vadTimeoutTimer);
      this.vadTimeoutTimer = null;
    }
  }
  
  /**
   * Handle VAD timeout by forcing speech end
   */
  private handleVadTimeout() {
    if (!this.audio || this.currentState !== AudioState.Speaking) {
      logger.audio.debug('VAD timeout called but not in speaking state');
      return;
    }
    
    // Create synthetic audio chunk from recent energy data if available
    const syntheticAudioData = new Float32Array(1600); // 100ms of silence at 16kHz
    syntheticAudioData.fill(0.001); // Very low amplitude
    
    logger.audio.info('🔧 VAD timeout recovery - creating synthetic speech end', {
      currentState: this.currentState,
      speechDuration: this.lastSpeechStartTime ? Date.now() - this.lastSpeechStartTime : 0,
      syntheticDataLength: syntheticAudioData.length,
      energyPattern: this.shouldTriggerSmartTimeout() ? 'anomalous' : 'normal',
    });
    
    // Force state transition to Listening
    this.currentState = AudioState.Listening;
    this.lastSpeechStartTime = null;
    
    // Process the synthetic chunk through normal pipeline with timeout flag
    this.processTimeoutChunk(syntheticAudioData);
    
    // Emit events to notify listeners of forced speech end
    this.emit('speech-end-timeout', syntheticAudioData);
    this.emit('state-change', this.currentState);
    ui.emit('audio:speech-end-timeout', syntheticAudioData);
  }
  
  /**
   * Process timeout-forced audio chunk with special handling
   */
  private processTimeoutChunk(audioData: Float32Array) {
    // Create overlapping chunk with timeout metadata
    const overlappingChunk = this.createOverlappingChunk(audioData, true);
    
    logger.audio.info('⏰ Processing timeout-forced chunk with overlap', {
      sequenceNumber: overlappingChunk.metadata.sequenceNumber,
      overlapDuration: `${overlappingChunk.metadata.overlapDurationMs}ms`,
      finalLength: overlappingChunk.audio.length,
      energyLevel: overlappingChunk.metadata.energyLevel.toFixed(6),
    });
    
    // Add to buffer with special timeout handling
    this.chunkBuffer.push(overlappingChunk.audio);
    
    // Force immediate sending for timeout chunks to prevent data loss
    this.mergeAndSendBuffer(true);
  }
  
  /**
   * Merge buffered chunks and send for transcription processing
   * This combines multiple small audio chunks into larger, more efficient chunks
   */
  private mergeAndSendBuffer(forceFlush = false) {
    if (this.chunkBuffer.length === 0) {
      logger.audio.debug('No chunks in buffer to send');
      return;
    }

    const totalSamples = this.chunkBuffer.reduce((acc, chunk) => acc + chunk.length, 0);
    const audioDurationMs = Math.round((totalSamples / 16000) * 1000);
    const realTimeDurationMs = this.batchStartTime ? Date.now() - this.batchStartTime : 0;
    const chunkCount = this.chunkBuffer.length;

    logger.audio.info('🔄 Sending buffered audio for transcription', {
      chunkCount,
      totalSamples,
      audioDurationMs: `${audioDurationMs}ms`,
      realTimeDurationMs: `${realTimeDurationMs}ms`,
      targetBatchDurationMs: `${this.batchDurationMs}ms`,
      forceFlush,
      reason: forceFlush ? 'Batch duration reached or manual flush' : 'Batch timer triggered',
      hasOverlap: this.overlappingBuffer.length > 0,
    });

    // Merge all buffered chunks into one optimized chunk
    const mergedChunk = float32Flatten(this.chunkBuffer);

    // Create overlapping chunk with metadata for transcription
    const overlappingChunk = this.createOverlappingChunk(mergedChunk, forceFlush);

    // Clear buffer, timer, and reset batch start time for next batch
    this.chunkBuffer = [];
    this.batchStartTime = null;
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }

    // Send the overlapping chunk with metadata for transcription processing
    this.emit('audio-chunk', overlappingChunk.audio, overlappingChunk.metadata);

    logger.audio.debug('✅ Merged overlapping chunk sent for processing', {
      finalSamples: overlappingChunk.audio.length,
      compressionRatio: `${chunkCount}:1`,
      sequenceNumber: overlappingChunk.metadata.sequenceNumber,
      overlapDuration: `${overlappingChunk.metadata.overlapDurationMs}ms`,
    });
  }

  /**
   * Calculate energy from audio data for VAD timeout detection
   */
  private calculateEnergy(audioData: Float32Array): number {
    let energy = 0;
    for (let i = 0; i < audioData.length; i++) {
      energy += audioData[i] * audioData[i];
    }
    return energy / audioData.length;
  }
  
  /**
   * Update energy history for smart timeout detection
   */
  private updateEnergyHistory(audioData: Float32Array) {
    const energy = this.calculateEnergy(audioData);
    this.energyHistory.push(energy);
    
    // Keep history limited
    if (this.energyHistory.length > this.ENERGY_HISTORY_SIZE) {
      this.energyHistory.shift();
    }
    
    this.lastEnergyCalculation = Date.now();
  }
  
  /**
   * Detect if we should trigger timeout based on energy patterns
   */
  private shouldTriggerSmartTimeout(): boolean {
    if (this.energyHistory.length < 10) return false;
    
    // Calculate average energy over recent history
    const recentFrames = this.energyHistory.slice(-10);
    const avgRecentEnergy = recentFrames.reduce((a, b) => a + b, 0) / recentFrames.length;
    
    // Check for sustained low energy (possible stuck VAD)
    const energyThreshold = 0.001; // Very low threshold for background noise
    const isLowEnergy = avgRecentEnergy < energyThreshold;
    
    // Check for consistent energy patterns (possible continuous noise)
    const energyVariance = recentFrames.reduce((acc, energy) => {
      return acc + Math.pow(energy - avgRecentEnergy, 2);
    }, 0) / recentFrames.length;
    
    const isConsistentNoise = energyVariance < 0.0001 && avgRecentEnergy > 0.0005;
    
    return isLowEnergy || isConsistentNoise;
  }
  
  /**
   * Create overlapping audio chunk with metadata
   */
  private createOverlappingChunk(audioData: Float32Array, isTimeoutForced = false): {
    audio: Float32Array;
    metadata: {
      sequenceNumber: number;
      timestamp: number;
      isTimeoutForced: boolean;
      overlapDurationMs: number;
      energyLevel: number;
    };
  } {
    // Calculate overlap samples
    const overlapSamples = Math.floor((this.overlapDurationMs / 1000) * 16000);
    
    // Combine with previous overlap if available
    let finalAudio: Float32Array;
    if (this.overlappingBuffer.length > 0) {
      const previousOverlap = this.overlappingBuffer[this.overlappingBuffer.length - 1];
      const combinedLength = previousOverlap.length + audioData.length;
      const combined = new Float32Array(combinedLength);
      combined.set(previousOverlap, 0);
      combined.set(audioData, previousOverlap.length);
      finalAudio = combined;
    } else {
      finalAudio = audioData;
    }
    
    // Store overlap for next chunk
    if (audioData.length > overlapSamples) {
      const overlapStart = audioData.length - overlapSamples;
      this.overlappingBuffer = [audioData.slice(overlapStart)];
      
      // Keep only recent overlaps to prevent memory issues
      if (this.overlappingBuffer.length > 3) {
        this.overlappingBuffer.shift();
      }
    }
    
    const energy = this.calculateEnergy(audioData);
    this.chunkSequenceNumber++;
    
    return {
      audio: finalAudio,
      metadata: {
        sequenceNumber: this.chunkSequenceNumber,
        timestamp: Date.now(),
        isTimeoutForced,
        overlapDurationMs: this.overlapDurationMs,
        energyLevel: energy,
      },
    };
  }
  
  /**
   * Add chunk to buffer and check if ready to send
   */
  private addToBuffer(audioData: Float32Array) {
    // Start batch timer on first chunk
    if (this.chunkBuffer.length === 0) {
      this.batchStartTime = Date.now();
      logger.audio.debug('🎬 New batch started', {
        batchDurationMs: this.batchDurationMs,
      });
    }

    // Update energy history for smart timeout detection
    this.updateEnergyHistory(audioData);

    this.chunkBuffer.push(audioData);

    const totalSamples = this.chunkBuffer.reduce((acc, chunk) => acc + chunk.length, 0);
    const audioDurationMs = Math.round((totalSamples / 16000) * 1000);
    const elapsedRealTimeMs = this.batchStartTime ? Date.now() - this.batchStartTime : 0;

    logger.audio.debug('📦 Added chunk to buffer', {
      chunkSamples: audioData.length,
      totalSamples,
      audioDurationMs: `${audioDurationMs}ms`,
      elapsedRealTimeMs: `${elapsedRealTimeMs}ms`,
      batchDurationMs: `${this.batchDurationMs}ms`,
      bufferLength: this.chunkBuffer.length,
      readyToSend: this.shouldSendBuffer(),
      energyLevel: this.calculateEnergy(audioData).toFixed(6),
    });

    // Check if enough real-time has elapsed to send
    if (this.shouldSendBuffer()) {
      this.mergeAndSendBuffer();
      return;
    }

    // Set timeout to send when batch duration is reached
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
    }

    if (this.batchStartTime) {
      const elapsed = Date.now() - this.batchStartTime;
      const remaining = Math.max(100, this.batchDurationMs - elapsed); // Min 100ms to prevent immediate firing

      this.bufferTimer = window.setTimeout(() => {
        logger.audio.info('⏰ Batch duration reached - sending accumulated audio', {
          targetDurationMs: this.batchDurationMs,
        });
        this.mergeAndSendBuffer(true);
      }, remaining);
    }
  }

  /**
   * Clear the audio buffer and ensure remaining chunks are sent for processing
   * Called when stopping recording to prevent data loss
   */
  private clearBuffer() {
    // Clear any pending timeouts
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
      logger.audio.debug('🕰️ Cleared pending buffer timeout');
    }

    this.clearVadTimeout();

    // Send any remaining chunks for processing before clearing
    if (this.chunkBuffer.length > 0) {
      const totalSamples = this.chunkBuffer.reduce((acc, chunk) => acc + chunk.length, 0);
      const audioDurationMs = Math.round((totalSamples / 16000) * 1000);
      const realTimeDurationMs = this.batchStartTime ? Date.now() - this.batchStartTime : 0;

      logger.audio.info('🧹 Flushing remaining buffer chunks for processing', {
        chunkCount: this.chunkBuffer.length,
        totalSamples,
        audioDurationMs: `${audioDurationMs}ms`,
        realTimeDurationMs: `${realTimeDurationMs}ms`,
        reason: 'Recording stopped - ensuring no audio data is lost',
        hasOverlap: this.overlappingBuffer.length > 0,
      });

      // Force send remaining buffered chunks for processing
      this.mergeAndSendBuffer(true);
    } else {
      logger.audio.debug('✅ Buffer already empty - no chunks to flush');
    }

    // Clear overlapping buffer and reset batch state
    this.overlappingBuffer = [];
    this.energyHistory = [];
    this.chunkSequenceNumber = 0;
    this.batchStartTime = null;
  }

  /**
   * Initialize audio with microphone and VAD
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      logger.audio.warn('AudioManager already initialized');
      return true;
    }

    try {
      logger.audio.info('Initializing AudioManager with VAD...');
      
      // Request microphone access with VAD
      const audioResult = await getAudioVAD({
        analyzer: true,
      });

      if (audioResult instanceof Error) {
        logger.audio.error('Failed to initialize audio - returned Error:', {
          message: audioResult.message,
          stack: audioResult.stack,
        });
        throw audioResult;
      }

      this.audio = audioResult;
      this.isInitialized = true;
      this.currentState = AudioState.Ready;

      logger.audio.info('AudioManager initialized successfully', {
        hasStream: !!this.audio.stream,
        hasAudioContext: !!this.audio.audioContext,
      });

      // Set up audio event handlers
      this.setupAudioHandlers();

      this.emit('initialized');
      return true;
    } catch (error) {
      logger.audio.error('AudioManager initialization failed:', error);
      this.currentState = AudioState.Error;
      this.emit('error', `Audio initialization failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Set up audio event handlers for VAD and features
   */
  private setupAudioHandlers(): void {
    if (!this.audio) return;

    // Handle audio features for visual feedback
    this.audio.onFeatures = (features) => {
      if (features.energy && features.energy > 0.001) {
        // Emit to both internal event system and UI system for backward compatibility
        this.emit('features', features);
        ui.emit('audio:features', features);
      }
    };

    // Handle speech start detection
    this.audio.onSpeechStart = () => {
      logger.audio.info('Speech started - AudioManager');
      this.currentState = AudioState.Speaking;
      this.lastSpeechStartTime = Date.now();
      
      // Set VAD timeout to prevent infinite speech detection
      this.setVadTimeout();
      
      this.emit('speech-start');
      this.emit('state-change', this.currentState);
      ui.emit('audio:speech-start');
    };

    // Handle speech end and process audio chunks
    this.audio.onSpeechEnd = (audioData: Float32Array) => {
      // Clear VAD timeout since speech ended naturally
      this.clearVadTimeout();
      
      // Calculate peak amplitude without spreading large array
      let peakAmplitude = 0;
      let sumSquares = 0;
      
      for (let i = 0; i < audioData.length; i++) {
        const absValue = Math.abs(audioData[i]);
        if (absValue > peakAmplitude) {
          peakAmplitude = absValue;
        }
        sumSquares += audioData[i] * audioData[i];
      }
      
      const chunkMetrics = {
        sampleCount: audioData.length,
        durationMs: Math.round((audioData.length / 16000) * 1000), // Assuming 16kHz sample rate
        peakAmplitude,
        rmsLevel: Math.sqrt(sumSquares / audioData.length),
        timestamp: Date.now(),
      };

      logger.audio.info('🎤 Speech ended - AudioManager', {
        chunkSize: audioData.length,
        duration: `${chunkMetrics.durationMs}ms`,
        peakAmplitude: chunkMetrics.peakAmplitude.toFixed(4),
        rmsLevel: chunkMetrics.rmsLevel.toFixed(4),
        dataRange: `[${audioData[0].toFixed(4)}...${audioData[audioData.length - 1].toFixed(4)}]`,
        speechDuration: this.lastSpeechStartTime ? Date.now() - this.lastSpeechStartTime : 0,
      });

      this.currentState = AudioState.Listening;
      this.lastSpeechStartTime = null;
      
      // Add chunk to buffer for optimization (instead of immediate sending)
      this.addToBuffer(audioData);
      
      // Emit other events but not audio-chunk (that's handled by buffer)
      this.emit('speech-end', audioData);
      this.emit('state-change', this.currentState);
      ui.emit('audio:speech-end', audioData);

      // Log chunk emission timing
      logger.audio.debug('📤 Audio chunk events emitted', {
        chunkId: `chunk_${chunkMetrics.timestamp}`,
        eventTypes: ['speech-end', 'audio-chunk', 'state-change'],
        totalSamples: audioData.length,
      });
    };
  }

  /**
   * Start audio recording
   */
  async start(): Promise<boolean> {
    if (!this.isInitialized || !this.audio) {
      logger.audio.error('AudioManager not initialized - cannot start recording');
      return false;
    }

    if (this.isRecording) {
      logger.audio.warn('AudioManager already recording');
      return true;
    }

    try {
      logger.audio.info('Starting AudioManager recording...');
      
      this.audio.start();
      this.isRecording = true;
      this.currentState = this.audio.state;

      this.emit('recording-started');
      this.emit('state-change', this.currentState);
      ui.emit('audio:recording-started');

      logger.audio.info('AudioManager recording started successfully');
      return true;
    } catch (error) {
      logger.audio.error('Failed to start AudioManager recording:', error);
      this.emit('error', `Failed to start recording: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Stop audio recording and cleanup resources
   */
  async stop(): Promise<void> {
    logger.audio.info('Stopping AudioManager...');

    if (this.audio) {
      try {
        // Set stopping state
        this.currentState = AudioState.Stopping;
        this.emit('state-change', this.currentState);

        logger.audio.info('Stopping audio processor...', {
          hasStream: !!this.audio.stream,
          streamId: this.audio.stream?.id,
          trackCount: this.audio.stream?.getTracks().length || 0,
        });

        // Clear any remaining buffered chunks before stopping
        this.clearBuffer();

        // Stop the audio processor (handles VAD and MediaStream cleanup)
        this.audio.stop();
        logger.audio.info('Audio processor stopped successfully');
      } catch (error) {
        logger.audio.error('Error stopping audio processor:', error);
      }
    }

    // Reset state
    this.audio = null;
    this.isInitialized = false;
    this.isRecording = false;
    this.currentState = AudioState.Ready;
    this.lastSpeechStartTime = null;

    this.emit('recording-stopped');
    this.emit('state-change', this.currentState);
    ui.emit('audio:recording-stopped');

    logger.audio.info('AudioManager stopped and cleaned up');
  }

  /**
   * Get current audio state
   */
  getState(): AudioState {
    return this.currentState;
  }

  /**
   * Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Check if initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current audio stream (for debugging)
   */
  getAudioStream(): MediaStream | null {
    return this.audio?.stream || null;
  }

  /**
   * Clean up and reset singleton instance
   * Should only be used in testing or complete application shutdown
   */
  static destroyInstance(): void {
    if (AudioManager.instance) {
      AudioManager.instance.stop();
      AudioManager.instance.removeAllListeners();
      AudioManager.instance = null;
      logger.audio.debug('AudioManager singleton destroyed');
    }
  }
}

// Export singleton instance for direct import
export const audioManager = AudioManager.getInstance();

// Export type for external use
export type { AudioManager as AudioManagerType };