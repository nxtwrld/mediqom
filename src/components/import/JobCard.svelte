<script lang="ts">
    import type { ImportJob } from '$lib/import/types';
    import { t } from '$lib/i18n';
    import { scale } from 'svelte/transition';

    interface Props {
        job: ImportJob;
        hasCachedFiles?: boolean;
        onreview?: (job: ImportJob) => void;
        onretry?: (job: ImportJob) => void;
        ondelete?: (job: ImportJob) => void;
    }

    let { job, hasCachedFiles = false, onreview, onretry, ondelete }: Props = $props();

    let thumbnail = $derived(
        job.file_manifest?.[0]?.thumbnail || null
    );

    let statusLabel = $derived(() => {
        switch (job.status) {
            case 'created': return $t('app.import.status-pending');
            case 'extracting': return $t('app.import.status-extracting');
            case 'analyzing': return $t('app.import.status-analyzing');
            case 'completed': return $t('app.import.status-ready');
            case 'error': return $t('app.import.status-error');
            default: return job.status;
        }
    });

    let isProcessing = $derived(
        job.status === 'extracting' || job.status === 'analyzing'
    );

    let progressPercent = $derived(job.progress || 0);
</script>

<div class="job-card {job.status}" transition:scale>
    <div class="preview">
        {#if thumbnail}
            <img src={thumbnail} alt={$t('aria.import.preview-file')} class="thumbnail" />
        {:else}
            <svg viewBox="0 0 24 24">
                <use href="/icons.svg#add-file" />
            </svg>
        {/if}

        {#if isProcessing}
            <div class="progress-bar">
                <div class="progress-fill" style="width: {progressPercent}%"></div>
            </div>
        {/if}
    </div>

    <div class="info">
        <div class="title">
            {$t('app.import.file-count', { values: { count: job.file_count } })}
        </div>
        <div class="status-label">{statusLabel()}</div>
        {#if job.message && isProcessing}
            <div class="message">{job.message}</div>
        {/if}
        {#if job.error}
            <div class="error-message">{job.error}</div>
        {/if}
    </div>

    <div class="actions">
        {#if job.status === 'completed'}
            <button class="button -small -primary" onclick={() => onreview?.(job)}>
                {hasCachedFiles ? $t('app.import.review-and-save') : $t('app.import.review')}
            </button>
        {/if}
        {#if job.status === 'error'}
            <button class="button -small" onclick={() => onretry?.(job)}>
                {$t('app.buttons.retry')}
            </button>
        {/if}
        <button class="button -small -ghost" onclick={() => ondelete?.(job)} aria-label={$t('aria.import.delete-job')}>
            <svg viewBox="0 0 24 24" width="16" height="16">
                <use href="/icons.svg#close" />
            </svg>
        </button>
    </div>
</div>

<style>
    .job-card {
        display: flex;
        align-items: center;
        gap: .75rem;
        padding: .75rem;
        background-color: var(--color-background);
        border: 2px solid var(--color-gray-300);
        border-radius: var(--radius-8);
        transition: border-color 0.2s;
    }

    .job-card.completed {
        border-color: var(--color-positive);
    }
    .job-card.error {
        border-color: var(--color-negative);
    }
    .job-card.extracting,
    .job-card.analyzing {
        border-color: var(--color-blue);
    }

    .preview {
        position: relative;
        width: 3rem;
        height: 3rem;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-radius: var(--radius-4);
        background: var(--color-gray-200);
    }
    .preview svg {
        width: 1.5rem;
        height: 1.5rem;
        fill: var(--color-interactivity);
    }
    .thumbnail {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .progress-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: var(--color-gray-300);
    }
    .progress-fill {
        height: 100%;
        background: var(--color-blue);
        transition: width 0.3s;
    }

    .info {
        flex: 1;
        min-width: 0;
    }
    .title {
        font-weight: 600;
        font-size: .85rem;
    }
    .status-label {
        font-size: .75rem;
        color: var(--color-text-secondary);
    }
    .message {
        font-size: .7rem;
        color: var(--color-text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .error-message {
        font-size: .7rem;
        color: var(--color-negative);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .actions {
        display: flex;
        gap: .25rem;
        align-items: center;
        flex-shrink: 0;
    }
    .actions .button.-ghost {
        padding: .25rem;
        min-width: unset;
    }
    .actions .button.-ghost svg {
        fill: currentColor;
    }
</style>
