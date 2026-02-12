<script lang="ts">
  import { scale, fly } from 'svelte/transition';
  import type { SSEProgressEvent } from '$lib/import/sse-client';
  import { t } from '$lib/i18n';

  interface FileProgress {
    fileId: string;
    fileName: string;
    fileSize: number;
    stage: 'extract' | 'analyze' | 'complete' | 'error';
    progress: number;
    message: string;
    thumbnail?: string;
    error?: string;
  }

  interface Props {
    fileProgress: FileProgress;
    compact?: boolean;
    showThumbnail?: boolean;
    onRetry?: (fileId: string) => void;
    onRemove?: (fileId: string) => void;
  }

  let {
    fileProgress,
    compact = false,
    showThumbnail = true,
    onRetry,
    onRemove
  }: Props = $props();

  // Reactive calculations
  let isComplete = $derived(fileProgress.stage === 'complete');
  let hasError = $derived(fileProgress.stage === 'error');
  let isProcessing = $derived(['extract', 'analyze'].includes(fileProgress.stage));

  let stageLabel = $derived(() => {
    switch (fileProgress.stage) {
      case 'extract':
        return $t('app.import.status-extracting');
      case 'analyze':
        return $t('app.import.status-analyzing');
      case 'complete':
        return $t('app.import.status-complete');
      case 'error':
        return $t('app.import.status-error');
      default:
        return $t('app.import.status-processing');
    }
  });

  let progressColor = $derived(() => {
    switch (fileProgress.stage) {
      case 'extract':
        return '#10b981'; // green
      case 'analyze':
        return '#8b5cf6'; // purple
      case 'complete':
        return '#059669'; // darker green
      case 'error':
        return '#ef4444'; // red
      default:
        return '#3b82f6'; // blue
    }
  });

  let formattedFileSize = $derived(() => {
    const size = fileProgress.fileSize;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  });
</script>

<div 
  class="file-progress-card" 
  class:compact 
  class:complete={isComplete}
  class:error={hasError}
  transition:scale={{ duration: 200 }}
>
  <!-- File Info Section -->
  <div class="file-info">
    {#if showThumbnail && fileProgress.thumbnail}
      <div class="thumbnail">
        <img src={fileProgress.thumbnail} alt={fileProgress.fileName} />
      </div>
    {:else}
      <div class="file-icon">
        {#if isComplete}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else if hasError}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {/if}
      </div>
    {/if}

    <div class="file-details">
      <div class="file-name" title={fileProgress.fileName}>
        {fileProgress.fileName}
      </div>
      {#if !compact}
        <div class="file-meta">
          <span class="file-size">{formattedFileSize}</span>
          <span class="stage-label">{stageLabel}</span>
        </div>
      {/if}
    </div>

    {#if compact}
      <div class="compact-status">
        <span class="progress-text">{Math.round(fileProgress.progress)}%</span>
      </div>
    {/if}
  </div>

  <!-- Progress Section -->
  {#if !compact}
    <div class="progress-section">
      <div class="progress-header">
        <span class="current-message">{fileProgress.message}</span>
        <span class="progress-percentage">{Math.round(fileProgress.progress)}%</span>
      </div>
      
      <div class="progress-bar">
        <div 
          class="progress-fill" 
          style="width: {fileProgress.progress}%; background-color: {progressColor};"
          transition:fly={{ x: -10, duration: 200 }}
        ></div>
      </div>
    </div>
  {/if}

  <!-- Processing Indicator -->
  {#if isProcessing}
    <div class="processing-indicator" transition:scale={{ duration: 200 }}>
      <div class="spinner" style="border-top-color: {progressColor};"></div>
    </div>
  {/if}

  <!-- Error State -->
  {#if hasError}
    <div class="error-section" transition:fly={{ y: 10, duration: 200 }}>
      <div class="error-message">
        {fileProgress.error || $t('app.import.processing-failed')}
      </div>
      <div class="error-actions">
        {#if onRetry}
          <button class="retry-btn" onclick={() => onRetry?.(fileProgress.fileId)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 4v6h6m16-6v6h-6M5 10a8 8 0 1114 6m-14-6a8 8 0 0114-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {$t('app.buttons.retry')}
          </button>
        {/if}
        {#if onRemove}
          <button class="remove-btn" onclick={() => onRemove?.(fileProgress.fileId)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {$t('app.buttons.remove')}
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Success Indicator -->
  {#if isComplete}
    <div class="success-indicator" transition:scale={{ duration: 300, delay: 100 }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 6L9 17L4 12" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  {/if}
</div>

<style>
  .file-progress-card {
    background: white;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    padding: 16px;
    position: relative;
    transition: all 0.2s ease;
  }

  .file-progress-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .file-progress-card.complete {
    border-color: #10b981;
    background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%);
  }

  .file-progress-card.error {
    border-color: #ef4444;
    background: linear-gradient(135deg, #ffffff 0%, #fef2f2 100%);
  }

  .file-progress-card.compact {
    padding: 12px;
  }

  /* File Info */
  .file-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .thumbnail {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-icon {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    flex-shrink: 0;
  }

  .file-progress-card.complete .file-icon {
    background: #dcfce7;
    color: #16a34a;
  }

  .file-progress-card.error .file-icon {
    background: #fee2e2;
    color: #dc2626;
  }

  .file-details {
    flex: 1;
    min-width: 0;
  }

  .file-name {
    font-weight: 600;
    color: #374151;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }

  .file-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #6b7280;
  }

  .compact-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .progress-text {
    font-size: 14px;
    font-weight: 600;
    color: #374151;
  }

  /* Progress Section */
  .progress-section {
    margin-top: 12px;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .current-message {
    font-size: 13px;
    color: #6b7280;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 12px;
  }

  .progress-percentage {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    background-color: #e5e7eb;
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  /* Processing Indicator */
  .processing-indicator {
    position: absolute;
    top: 8px;
    right: 8px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #e5e7eb;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Error Section */
  .error-section {
    margin-top: 12px;
    padding: 12px;
    background: #fef2f2;
    border-radius: 6px;
    border: 1px solid #fecaca;
  }

  .error-message {
    font-size: 13px;
    color: #dc2626;
    margin-bottom: 8px;
  }

  .error-actions {
    display: flex;
    gap: 8px;
  }

  .retry-btn,
  .remove-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .retry-btn {
    background: white;
    color: #dc2626;
    border-color: #fca5a5;
  }

  .retry-btn:hover {
    background: #fef2f2;
  }

  .remove-btn {
    background: #dc2626;
    color: white;
    border-color: #dc2626;
  }

  .remove-btn:hover {
    background: #b91c1c;
  }

  /* Success Indicator */
  .success-indicator {
    position: absolute;
    top: 8px;
    right: 8px;
    background: white;
    border-radius: 50%;
    padding: 2px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  /* Responsive Design */
  @media (max-width: 640px) {
    .file-progress-card {
      padding: 12px;
    }

    .file-name {
      font-size: 13px;
    }

    .file-meta {
      font-size: 11px;
    }

    .error-actions {
      flex-direction: column;
    }

    .retry-btn,
    .remove-btn {
      justify-content: center;
    }
  }
</style>