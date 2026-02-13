<script lang="ts">
  import { getAudioManager } from '$lib/audio/AudioManager';
  import { convertFloat32ToMp3 } from '$lib/audio/microphone';
  import { float32Flatten } from '$lib/array';
  import { onDestroy } from 'svelte';

  interface Props {
    onAudioReady: (file: File) => void;
    disabled?: boolean;
  }

  let { onAudioReady, disabled = false }: Props = $props();

  // Audio input mode
  let inputMode = $state<'upload' | 'test' | 'record'>('upload');

  // Upload mode
  let uploadedFile = $state<File | null>(null);

  // Test file mode
  const testAudioFiles = [
    '1 Tomasek score pre10 post05.m4a',
    '2 Martinka score pre10 post00.m4a',
    '3 Betka score pre05 post02.m4a',
    '4 Kacka score pre06 post01.m4a'
  ];
  let selectedTestFile = $state<string>('');

  // Recording mode
  let audioChunks = $state<Float32Array[]>([]);
  let isRecording = $state(false);
  let recordingDuration = $state(0);
  let recordingTimer: number | null = null;

  // Handle file upload
  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      uploadedFile = file;
      onAudioReady(file);
    }
  }

  // Handle test file selection
  async function handleTestFileSelect() {
    if (!selectedTestFile) return;

    try {
      const response = await fetch(`/test-audio-form/${selectedTestFile}`);
      if (!response.ok) throw new Error('Failed to load test file');

      const blob = await response.blob();
      // Preserve original file extension and set appropriate MIME type
      const extension = selectedTestFile.split('.').pop()?.toLowerCase() || 'm4a';
      const mimeType = extension === 'm4a' ? 'audio/x-m4a' : `audio/${extension}`;
      const file = new File([blob], selectedTestFile, { type: mimeType });
      onAudioReady(file);
    } catch (error) {
      console.error('Error loading test file:', error);
      alert('Failed to load test audio file');
    }
  }

  // Recording functions
  async function startRecording() {
    try {
      // Initialize audioManager (user interaction context required)
      const initialized = await getAudioManager().initialize();
      if (!initialized) {
        alert('Failed to access microphone');
        return;
      }

      // Subscribe to audio-chunk events
      getAudioManager().on('audio-chunk', handleAudioChunk);
      await getAudioManager().start();
      isRecording = true;

      // Start duration timer
      recordingDuration = 0;
      recordingTimer = window.setInterval(() => {
        recordingDuration++;
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording');
    }
  }

  function handleAudioChunk(chunk: Float32Array, metadata: any) {
    // AudioManager already handles VAD and buffering (10s chunks)
    audioChunks.push(chunk);
    console.log('📦 Received audio chunk:', {
      samples: chunk.length,
      sequenceNumber: metadata?.sequenceNumber,
      totalChunks: audioChunks.length
    });
  }

  async function stopRecording() {
    await getAudioManager().stop();
    getAudioManager().off('audio-chunk', handleAudioChunk);

    // Stop timer
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }

    if (audioChunks.length === 0) {
      alert('No audio recorded. Please try again.');
      isRecording = false;
      return;
    }

    try {
      // Concatenate all chunks
      const combined = float32Flatten(audioChunks);
      console.log('🎤 Finalizing recording:', {
        totalChunks: audioChunks.length,
        totalSamples: combined.length,
        durationSeconds: Math.round(combined.length / 16000)
      });

      // Convert to MP3
      const mp3Blob = await convertFloat32ToMp3(combined, 16000);
      const audioFile = new File([mp3Blob], 'recording.mp3', { type: 'audio/mp3' });

      isRecording = false;
      audioChunks = [];

      onAudioReady(audioFile);
    } catch (error) {
      console.error('Failed to process recording:', error);
      alert('Failed to process recording');
      isRecording = false;
      audioChunks = [];
    }
  }

  // Format duration as MM:SS
  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  onDestroy(() => {
    if (recordingTimer) {
      clearInterval(recordingTimer);
    }
    if (isRecording) {
      getAudioManager().off('audio-chunk', handleAudioChunk);
    }
  });
</script>

<div class="serenity-audio-input">
  <h3>Audio Input</h3>

  <!-- Mode selector -->
  <div class="mode-selector">
    <button
      class:active={inputMode === 'upload'}
      onclick={() => inputMode = 'upload'}
      {disabled}
    >
      Upload File
    </button>
    <button
      class:active={inputMode === 'test'}
      onclick={() => inputMode = 'test'}
      {disabled}
    >
      Test Files
    </button>
    <button
      class:active={inputMode === 'record'}
      onclick={() => inputMode = 'record'}
      {disabled}
    >
      Record Audio
    </button>
  </div>

  <!-- Upload mode -->
  {#if inputMode === 'upload'}
    <div class="upload-section">
      <input
        type="file"
        accept="audio/*"
        onchange={handleFileUpload}
        {disabled}
      />
      {#if uploadedFile}
        <p class="file-info">Selected: {uploadedFile.name}</p>
      {/if}
    </div>
  {/if}

  <!-- Test file mode -->
  {#if inputMode === 'test'}
    <div class="test-file-section">
      <select bind:value={selectedTestFile} onchange={handleTestFileSelect} {disabled}>
        <option value="">Select a test file...</option>
        {#each testAudioFiles as file}
          <option value={file}>{file}</option>
        {/each}
      </select>
      <p class="hint">Test files include expected scores in their names</p>
    </div>
  {/if}

  <!-- Recording mode -->
  {#if inputMode === 'record'}
    <div class="record-section">
      {#if !isRecording}
        <button class="record-button" onclick={startRecording} {disabled}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
          </svg>
          Start Recording
        </button>
      {:else}
        <div class="recording-active">
          <button class="stop-button" onclick={stopRecording}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
            </svg>
            Stop Recording
          </button>
          <p class="recording-duration">{formatDuration(recordingDuration)}</p>
          <p class="recording-status">Recording... (silence is automatically skipped)</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .serenity-audio-input {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.25rem;
  }

  .mode-selector {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .mode-selector button {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    background: var(--color-background);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .mode-selector button:hover {
    background: var(--color-background-hover, #f5f5f5);
  }

  .mode-selector button.active {
    background: var(--color-interactivity);
    color: var(--color-interactivity-text);
    border-color: var(--color-interactivity);
  }

  .mode-selector button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .upload-section input[type="file"] {
    width: 100%;
    padding: 0.75rem;
    border: 2px dashed var(--color-border);
    border-radius: 4px;
    cursor: pointer;
  }

  .file-info {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-positive);
  }

  .test-file-section select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-background);
  }

  .hint {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary, #666);
  }

  .record-section {
    text-align: center;
  }

  .record-button,
  .stop-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    font-size: 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .record-button {
    background: var(--color-positive);
    color: white;
  }

  .record-button:hover {
    background: var(--color-positive-hover, #28a745);
  }

  .stop-button {
    background: var(--color-negative);
    color: white;
  }

  .stop-button:hover {
    background: var(--color-negative-hover, #c82333);
  }

  .recording-active {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .recording-duration {
    font-size: 1.5rem;
    font-weight: bold;
    margin: 0.5rem 0;
  }

  .recording-status {
    font-size: 0.875rem;
    color: var(--color-text-secondary, #666);
    margin: 0;
  }
</style>
