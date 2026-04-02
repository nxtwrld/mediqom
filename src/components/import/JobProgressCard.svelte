<script lang="ts">
    import type { ImportJob } from '$lib/import/types';
    import { formatImportError } from '$lib/import/job-store';
    import { t } from '$lib/i18n';
    import { scale } from 'svelte/transition';

    interface Props {
        job: ImportJob;
        onretry?: (job: ImportJob) => void;
        ondelete?: (job: ImportJob) => void;
    }

    let { job, onretry, ondelete }: Props = $props();

    let statusLabel = $derived(() => {
        switch (job.status) {
            case 'preparing': return $t('app.import.status-preparing');
            case 'created': return $t('app.import.status-pending');
            case 'extracting': return $t('app.import.status-extracting');
            case 'analyzing': return $t('app.import.status-analyzing');
            case 'loading': return $t('app.import.status-loading');
            case 'error': return $t('app.import.status-error');
            default: return job.status;
        }
    });

    let progressPercent = $derived(job.progress || 0);
</script>

<div class="job-progress-card {job.status}" transition:scale>
    <div class="card-header">
        <span class="file-count">
            {$t('app.import.file-count', { values: { count: job.file_count } })}
        </span>
        <span class="status-label">{statusLabel()}</span>
        <button class="delete-btn" onclick={() => ondelete?.(job)} aria-label={$t('aria.import.delete-job')}>
            <svg viewBox="0 0 24 24" width="14" height="14">
                <use href="/icons.svg#close" />
            </svg>
        </button>
    </div>

    <div class="progress-bar">
        <div class="progress-fill" style="width: {progressPercent}%"></div>
    </div>
    <div class="progress-label">{Math.round(progressPercent)}%</div>

    {#if job.message && job.status !== 'error'}
        <div class="message">{job.message}</div>
    {/if}

    {#if job.status === 'error'}
        <div class="error-row">
            <span class="error-message">{job.error ? formatImportError(job.error) : $t('app.import.processing-failed')}</span>
            {#if onretry}
                <button class="button -small" onclick={() => onretry?.(job)}>
                    {$t('app.buttons.retry')}
                </button>
            {/if}
        </div>
    {/if}
</div>

<style>
    .job-progress-card {
        padding: var(--ui-pad-medium);
        background-color: var(--color-background);
        border: 2px solid var(--color-gray-300);
        border-radius: var(--ui-radius-medium);
    }

    .job-progress-card.extracting,
    .job-progress-card.analyzing {
        border-color: var(--color-blue);
    }
    .job-progress-card.error {
        border-color: var(--color-negative);
    }

    .card-header {
        display: flex;
        align-items: center;
        gap: var(--ui-pad-small);
        margin-bottom: var(--ui-pad-small);
    }

    .file-count {
        font-weight: 600;
        font-size: 0.85rem;
    }

    .status-label {
        flex: 1;
        font-size: 0.75rem;
        color: var(--color-text-secondary);
    }

    .delete-btn {
        padding: 0.25rem;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-text-secondary);
        border-radius: var(--ui-radius-small);
    }
    .delete-btn:hover {
        background: var(--color-gray-300);
    }
    .delete-btn svg {
        fill: currentColor;
    }

    .progress-bar {
        width: 100%;
        height: 0.5rem;
        background: var(--color-gray-300);
        border-radius: 0.25rem;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: var(--color-blue);
        border-radius: 0.25rem;
        transition: width 0.3s;
    }

    .job-progress-card.loading .progress-fill,
    .job-progress-card.preparing .progress-fill {
        width: 100% !important;
        animation: pulse-bar 1.5s ease-in-out infinite;
    }

    @keyframes pulse-bar {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.7; }
    }

    .job-progress-card.error .progress-fill {
        background: var(--color-negative);
    }

    .progress-label {
        font-size: 0.7rem;
        color: var(--color-text-secondary);
        margin-top: 0.2rem;
        text-align: right;
    }

    .message {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        margin-top: var(--ui-pad-small);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .error-row {
        display: flex;
        align-items: center;
        gap: var(--ui-pad-small);
        margin-top: var(--ui-pad-small);
    }

    .error-message {
        flex: 1;
        font-size: 0.75rem;
        color: var(--color-negative);
    }
</style>
