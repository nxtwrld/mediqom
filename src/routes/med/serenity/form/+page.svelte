<script lang="ts">
  import SerenityAudioInput from '$components/serenity/SerenityAudioInput.svelte';
  import SerenityFormResults from '$components/serenity/SerenityFormResults.svelte';
  import type { SerenityFormResponse } from '$lib/serenity/types';
  import type { PageData } from './$types';
  import { apiFetch } from '$lib/api/client';

  let { data }: { data: PageData } = $props();

  let formType = $state<'pre' | 'post'>('pre');
  let language = $state<'en' | 'cs' | 'de'>('en');
  let audioFile = $state<File | null>(null);
  let transcript = $state<string>('');
  let formResults = $state<SerenityFormResponse | null>(null);
  let isProcessing = $state(false);
  let processingStage = $state<'transcribing' | 'analyzing' | null>(null);
  let error = $state<string | null>(null);

  async function handleAudioReady(file: File) {
    audioFile = file;
    transcript = '';
    formResults = null;
    error = null;
    isProcessing = true;

    try {
      // Stage 1: Transcribe
      processingStage = 'transcribing';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('instructions', JSON.stringify({
        lang: language,
        translate: false
      }));

      const transcribeResponse = await apiFetch('/v1/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!transcribeResponse.ok) {
        throw new Error(`Transcription failed: ${transcribeResponse.statusText}`);
      }

      const transcribeResult = await transcribeResponse.json();
      transcript = transcribeResult.text;

      if (!transcript || transcript.trim().length === 0) {
        throw new Error('No speech detected in audio file');
      }

      // Stage 2: Analyze
      processingStage = 'analyzing';
      const analyzeResponse = await apiFetch('/v1/serenity/analyze', {
        method: 'POST',
        body: JSON.stringify({ transcript, formType, language })
      });

      if (!analyzeResponse.ok) {
        throw new Error(`Analysis failed: ${analyzeResponse.statusText}`);
      }

      formResults = await analyzeResponse.json();

    } catch (err) {
      console.error('Processing failed:', err);
      error = `Processing failed: ${(err as Error).message}`;
    } finally {
      isProcessing = false;
      processingStage = null;
    }
  }

  function resetForm() {
    audioFile = null;
    transcript = '';
    formResults = null;
    error = null;
  }

  // Get current form schema for display
  let currentFormSchema = $derived(data.formSchemas[formType]);
</script>

<svelte:head>
  <title>SERENITY Therapeutic Assessment - Aouros</title>
</svelte:head>

<div class="serenity-form-page">
  <header>
    <h1>SERENITY Therapeutic Assessment</h1>
    <p class="subtitle">
      {currentFormSchema.title} - {currentFormSchema.description}
    </p>
  </header>

  <div class="controls">
    <!-- Form type selector -->
    <div class="form-selector">
      <h3>Assessment Type</h3>
      <div class="radio-group">
        <label>
          <input
            type="radio"
            bind:group={formType}
            value="pre"
            disabled={isProcessing}
            onchange={resetForm}
          />
          <span>Pre-Session</span>
        </label>
        <label>
          <input
            type="radio"
            bind:group={formType}
            value="post"
            disabled={isProcessing}
            onchange={resetForm}
          />
          <span>Post-Session</span>
        </label>
      </div>
    </div>

    <!-- Language selector -->
    <div class="language-selector">
      <h3>Language</h3>
      <select bind:value={language} disabled={isProcessing}>
        <option value="en">English</option>
        <option value="cs" selected>Czech</option>
        <option value="de">German</option>
      </select>
    </div>
  </div>

  <!-- Audio input -->
  <SerenityAudioInput
    onAudioReady={handleAudioReady}
    disabled={isProcessing}
  />

  <!-- Processing status -->
  {#if isProcessing}
    <div class="processing">
      <div class="spinner"></div>
      <p>
        {#if processingStage === 'transcribing'}
          Transcribing audio...
        {:else if processingStage === 'analyzing'}
          Analyzing observations with AI...
        {:else}
          Processing...
        {/if}
      </p>
    </div>
  {/if}

  <!-- Error display -->
  {#if error}
    <div class="error-message">
      <h4>Error</h4>
      <p>{error}</p>
      <button onclick={resetForm}>Try Again</button>
    </div>
  {/if}

  <!-- Transcript display -->
  {#if transcript && !error}
    <div class="transcript-section">
      <h3>Transcript</h3>
      <div class="transcript-box">
        <textarea readonly value={transcript}></textarea>
        <p class="word-count">
          {transcript.split(/\s+/).filter(w => w.length > 0).length} words
        </p>
      </div>
    </div>
  {/if}

  <!-- Form results -->
  {#if formResults && !error}
    <SerenityFormResults {formResults} {formType} />

    <div class="actions">
      <button class="reset-button" onclick={resetForm}>
        New Assessment
      </button>
    </div>
  {/if}
</div>

<style>
  .serenity-form-page {
    max-width: 1000px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
  }

  .subtitle {
    color: var(--color-text-secondary, #666);
    margin: 0;
  }

  .controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .form-selector,
  .language-selector {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 1.5rem;
  }

  h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.125rem;
  }

  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .radio-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .radio-group input[type="radio"] {
    cursor: pointer;
  }

  .radio-group input[type="radio"]:disabled {
    cursor: not-allowed;
  }

  .language-selector select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-background);
    font-size: 1rem;
  }

  .processing {
    text-align: center;
    padding: 2rem;
    background: var(--color-background-secondary, #f9f9f9);
    border-radius: 8px;
    margin: 1.5rem 0;
  }

  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto 1rem;
    border: 4px solid var(--color-border);
    border-top-color: var(--color-interactivity);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-message {
    background: #fff5f5;
    border: 1px solid var(--color-negative);
    border-radius: 8px;
    padding: 1.5rem;
    margin: 1.5rem 0;
  }

  .error-message h4 {
    margin-top: 0;
    color: var(--color-negative);
  }

  .error-message button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--color-negative);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .transcript-section {
    margin: 1.5rem 0;
  }

  .transcript-box {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 1rem;
    background: var(--color-background-secondary, #f9f9f9);
  }

  .transcript-box textarea {
    width: 100%;
    min-height: 150px;
    border: none;
    background: transparent;
    font-family: inherit;
    font-size: 0.875rem;
    resize: vertical;
    padding: 0;
  }

  .word-count {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #666);
    text-align: right;
    margin: 0.5rem 0 0 0;
  }

  .actions {
    text-align: center;
    margin-top: 2rem;
  }

  .reset-button {
    padding: 0.75rem 2rem;
    background: var(--color-interactivity);
    color: var(--color-interactivity-text);
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .reset-button:hover {
    opacity: 0.9;
  }

  @media (max-width: 768px) {
    .controls {
      grid-template-columns: 1fr;
    }

    .serenity-form-page {
      padding: 1rem;
    }
  }
</style>
