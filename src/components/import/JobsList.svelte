<script lang="ts">
    import { onMount } from 'svelte';
    import { checkPendingJobs, deleteJob, retryJob, processJob } from '$lib/import/job-manager';
    import { activeJobs, completedJobs, errorJobs, importJobs } from '$lib/import/job-store';
    import { hasFiles } from '$lib/import/file-cache';
    import type { ImportJob } from '$lib/import/types';
    import { get } from 'svelte/store';
    import JobCard from './JobCard.svelte';
    import ui from '$lib/ui';
    import { t } from '$lib/i18n';

    // Cache availability per job
    let cacheStatus: Record<string, boolean> = $state({});

    onMount(async () => {
        // Only fetch from API if the store is empty (preserves in-progress local state)
        const current = get(importJobs);
        const jobs = current.length > 0 ? current : await checkPendingJobs();

        for (const job of jobs) {
            cacheStatus[job.id] = await hasFiles(job.id);
        }

        // Resume polling for active jobs
        for (const job of get(activeJobs)) {
            processJob(job.id).catch(() => {});
        }
    });

    function handleNewImport() {
        ui.emit('overlay.import', { autoOpen: true });
    }

    function handleReview(job: ImportJob) {
        ui.emit('overlay.import', { jobId: job.id });
    }

    async function handleRetry(job: ImportJob) {
        await retryJob(job.id);
        await processJob(job.id).catch(() => {});
    }

    async function handleDelete(job: ImportJob) {
        await deleteJob(job.id);
        delete cacheStatus[job.id];
    }

    let hasAnyJobs = $derived($importJobs.length > 0);
</script>

<div class="jobs-list">
    <div class="jobs-header">
        <h2>{$t('app.nav.import')}</h2>
        <button class="button -primary" onclick={handleNewImport}>
            <svg class="btn-icon"><use href="/icons.svg#add-file" /></svg>
            {$t('app.import.new-import')}
        </button>
    </div>

    {#if $activeJobs.length > 0}
        <h3 class="section-heading">{$t('app.import.section-processing')}</h3>
        <div class="job-section">
            {#each $activeJobs as job (job.id)}
                <JobCard {job} ondelete={handleDelete} />
            {/each}
        </div>
    {/if}

    {#if $completedJobs.length > 0}
        <h3 class="section-heading">{$t('app.import.section-ready')}</h3>
        <div class="job-section">
            {#each $completedJobs as job (job.id)}
                <JobCard
                    {job}
                    hasCachedFiles={cacheStatus[job.id] || false}
                    onreview={handleReview}
                    ondelete={handleDelete}
                />
            {/each}
        </div>
    {/if}

    {#if $errorJobs.length > 0}
        <h3 class="section-heading">{$t('app.import.section-errors')}</h3>
        <div class="job-section">
            {#each $errorJobs as job (job.id)}
                <JobCard
                    {job}
                    hasCachedFiles={cacheStatus[job.id] || false}
                    onretry={handleRetry}
                    ondelete={handleDelete}
                />
            {/each}
        </div>
    {/if}

    {#if !hasAnyJobs}
        <p class="empty-state">{$t('app.import.no-jobs')}</p>
    {/if}
</div>

<style>
    .jobs-list {
        padding: var(--ui-pad-medium);
        max-width: 40rem;
        margin: 0 auto;
    }

    .jobs-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--ui-pad-large);
    }

    .jobs-header h2 {
        margin: 0;
    }

    .btn-icon {
        width: 1.25rem;
        height: 1.25rem;
        fill: currentColor;
        margin-right: 0.25rem;
    }

    .section-heading {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin: var(--ui-pad-medium) 0 var(--ui-pad-small);
    }

    .job-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .empty-state {
        text-align: center;
        color: var(--color-text-secondary);
        padding: var(--ui-pad-xlarge) 0;
    }
</style>
