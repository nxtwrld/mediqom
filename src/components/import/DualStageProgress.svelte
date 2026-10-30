<script lang="ts">
  import { onMount } from 'svelte';
  import { scale, fly } from 'svelte/transition';
  import { t } from '$lib/i18n';

  interface Props {
    overallProgress: number; // 0-100
    currentStage: 'extract' | 'analyze' | 'complete' | 'error';
    extractProgress: number; // 0-100
    analyzeProgress: number; // 0-100
    currentMessage: string;
    filesTotal: number;
    filesCompleted: number;
    showDetails?: boolean;
  }

  let {
    overallProgress = 0,
    currentStage = 'extract',
    extractProgress = 0,
    analyzeProgress = 0,
    currentMessage = '',
    filesTotal = 0,
    filesCompleted = 0,
    showDetails = true
  }: Props = $props();

  // Reactive calculations
  let stageProgress = $derived(() => {
    switch (currentStage) {
      case 'extract':
        return extractProgress;
      case 'analyze':
        return analyzeProgress;
      case 'complete':
        return 100;
      case 'error':
        return 0;
      default:
        return 0;
    }
  });

  let stageLabel = $derived(() => {
    switch (currentStage) {
      case 'extract':
        return $t('app.import.stage-extracting-text');
      case 'analyze':
        return $t('app.import.stage-analyzing-content');
      case 'complete':
        return $t('app.import.status-complete');
      case 'error':
        return $t('app.import.status-error');
      default:
        return $t('app.import.status-processing');
    }
  });

  let extractionComplete = $derived(currentStage !== 'extract');
  let analysisActive = $derived(currentStage === 'analyze');
  let analysisComplete = $derived(currentStage === 'complete');
</script>

<div class="dual-stage-progress" class:error={currentStage === 'error'}>
  <!-- Overall Progress Bar -->
  <div class="overall-progress">
    <div class="progress-header">
      <h3>{$t('app.import.processing-medical-documents')}</h3>
      <span class="progress-percentage">{Math.round(overallProgress)}%</span>
    </div>
    <div class="progress-bar overall">
      <div 
        class="progress-fill" 
        style="width: {overallProgress}%"
        transition:fly={{ x: -20, duration: 300 }}
      ></div>
    </div>
  </div>

  <!-- Two-Stage Visualization -->
  <div class="stages-container">
    <!-- Stage 1: Extraction -->
    <div class="stage" class:active={currentStage === 'extract'} class:complete={extractionComplete}>
      <div class="stage-header">
        <div class="stage-icon">
          {#if extractionComplete}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {:else}
            <div class="spinner"></div>
          {/if}
        </div>
        <h4>{$t('app.import.stage-text-extraction')}</h4>
        <span class="stage-progress">{Math.round(extractProgress)}%</span>
      </div>
      <div class="progress-bar stage-bar">
        <div 
          class="progress-fill extract" 
          style="width: {extractProgress}%"
          transition:fly={{ x: -10, duration: 200 }}
        ></div>
      </div>
      <p class="stage-description">
        {$t('app.import.stage-extraction-description')}
      </p>
    </div>

    <!-- Stage Connector -->
    <div class="stage-connector" class:active={analysisActive || analysisComplete}>
      <div class="connector-line"></div>
      <div class="connector-arrow">→</div>
    </div>

    <!-- Stage 2: Analysis -->
    <div class="stage" class:active={currentStage === 'analyze'} class:complete={analysisComplete}>
      <div class="stage-header">
        <div class="stage-icon">
          {#if analysisComplete}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {:else if analysisActive}
            <div class="spinner"></div>
          {:else}
            <div class="stage-number">2</div>
          {/if}
        </div>
        <h4>{$t('app.import.stage-medical-analysis')}</h4>
        <span class="stage-progress">{Math.round(analyzeProgress)}%</span>
      </div>
      <div class="progress-bar stage-bar">
        <div 
          class="progress-fill analyze" 
          style="width: {analyzeProgress}%"
          transition:fly={{ x: -10, duration: 200 }}
        ></div>
      </div>
      <p class="stage-description">
        {$t('app.import.stage-analysis-description')}
      </p>
    </div>
  </div>

  <!-- Current Status -->
  <div class="current-status">
    <div class="status-message">
      <span class="status-label">{stageLabel()}:</span>
      <span class="message-text">{currentMessage}</span>
    </div>
    
    {#if showDetails && filesTotal > 0}
      <div class="file-counter" transition:scale={{ duration: 200 }}>
        <span>{$t('app.import.files-processed', { values: { completed: filesCompleted, total: filesTotal } })}</span>
      </div>
    {/if}
  </div>

  <!-- Error State -->
  {#if currentStage === 'error'}
    <div class="error-state" transition:fly={{ y: 20, duration: 300 }}>
      <div class="error-icon">⚠️</div>
      <p>{$t('app.import.processing-failed-try-again')}</p>
    </div>
  {/if}
</div>

<style>
  .dual-stage-progress {
    background: white;
    border-radius: 1.2rem;
    padding: 2.4rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    max-width: 60rem;
    margin: 0 auto;
  }

  .dual-stage-progress.error {
    border-left: 0.4rem solid #ef4444;
  }

  /* Overall Progress */
  .overall-progress {
    margin-bottom: 3.2rem;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.2rem;
  }

  .progress-header h3 {
    margin: 0;
    color: #1f2937;
    font-size: 1.8rem;
    font-weight: 600;
  }

  .progress-percentage {
    font-size: 1.8rem;
    font-weight: 700;
    color: #3b82f6;
  }

  .progress-bar {
    width: 100%;
    height: 0.8rem;
    background-color: #e5e7eb;
    border-radius: 0.4rem;
    overflow: hidden;
  }

  .progress-bar.overall {
    height: 1.2rem;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #1d4ed8);
    border-radius: 0.4rem;
    transition: width 0.3s ease;
  }

  .progress-fill.extract {
    background: linear-gradient(90deg, #10b981, #059669);
  }

  .progress-fill.analyze {
    background: linear-gradient(90deg, #8b5cf6, #7c3aed);
  }

  /* Stages */
  .stages-container {
    display: flex;
    align-items: center;
    gap: 1.6rem;
    margin-bottom: 2.4rem;
  }

  .stage {
    flex: 1;
    padding: 1.6rem;
    border-radius: 0.8rem;
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    transition: all 0.3s ease;
  }

  .stage.active {
    background: #eff6ff;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .stage.complete {
    background: #f0fdf4;
    border-color: #10b981;
  }

  .stage-header {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-bottom: 0.8rem;
  }

  .stage-icon {
    width: 2.4rem;
    height: 2.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #e5e7eb;
    color: #6b7280;
    font-size: 1.2rem;
    font-weight: 600;
  }

  .stage.active .stage-icon {
    background: #3b82f6;
    color: white;
  }

  .stage.complete .stage-icon {
    background: #10b981;
    color: white;
  }

  .stage-number {
    font-size: 1.2rem;
    font-weight: 600;
  }

  .stage h4 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    color: #374151;
    flex: 1;
  }

  .stage-progress {
    font-size: 1.2rem;
    font-weight: 600;
    color: #6b7280;
  }

  .stage.active .stage-progress {
    color: #3b82f6;
  }

  .stage-bar {
    height: 0.4rem;
    margin-bottom: 0.8rem;
  }

  .stage-description {
    font-size: 1.2rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.4;
  }

  /* Stage Connector */
  .stage-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    opacity: 0.5;
    transition: opacity 0.3s ease;
  }

  .stage-connector.active {
    opacity: 1;
  }

  .connector-line {
    width: 0.2rem;
    height: 2rem;
    background: #d1d5db;
    margin-bottom: 0.4rem;
  }

  .stage-connector.active .connector-line {
    background: #3b82f6;
  }

  .connector-arrow {
    font-size: 1.6rem;
    color: #d1d5db;
    font-weight: bold;
  }

  .stage-connector.active .connector-arrow {
    color: #3b82f6;
  }

  /* Current Status */
  .current-status {
    border-top: 1px solid #e5e7eb;
    padding-top: 1.6rem;
  }

  .status-message {
    display: flex;
    gap: 0.8rem;
    margin-bottom: 0.8rem;
  }

  .status-label {
    font-weight: 600;
    color: #374151;
  }

  .message-text {
    color: #6b7280;
    flex: 1;
  }

  .file-counter {
    font-size: 1.4rem;
    color: #6b7280;
    text-align: center;
  }

  /* Error State */
  .error-state {
    text-align: center;
    padding: 1.6rem;
    background: #fef2f2;
    border-radius: 0.8rem;
    border: 1px solid #fecaca;
    margin-top: 1.6rem;
  }

  .error-icon {
    font-size: 2.4rem;
    margin-bottom: 0.8rem;
  }

  .error-state p {
    margin: 0;
    color: #dc2626;
    font-size: 1.4rem;
  }

  /* Spinner Animation */
  .spinner {
    width: 1.6rem;
    height: 1.6rem;
    border: 2px solid #e5e7eb;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .stages-container {
      flex-direction: column;
      gap: 1.2rem;
    }

    .stage-connector {
      transform: rotate(90deg);
    }

    .connector-line {
      width: 2rem;
      height: 0.2rem;
    }

    .connector-arrow {
      transform: rotate(90deg);
    }
  }
</style>