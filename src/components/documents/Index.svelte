<script lang="ts">
    import { profile, profileDocumentsLoading } from '$lib/profiles';
    import userStore from '$lib/user';
    import { byUser } from '$lib/documents';
    import { type Document } from '$lib/documents/types.d';
    import DocumentTile from './DocumentTile.svelte';
    import Loading from '$components/ui/Loading.svelte';
    import { onMount } from 'svelte';

    // Import job support
    import { checkPendingJobs, deleteJob, retryJob, processJob } from '$lib/import/job-manager';
    import { pendingJobs, activeJobs } from '$lib/import/job-store';
    import { hasFiles } from '$lib/import/file-cache';
    import type { ImportJob } from '$lib/import/types';
    import JobCard from '$components/import/JobCard.svelte';
    import ui from '$lib/ui';
    import { t } from '$lib/i18n';
    import { apiGet } from '$lib/api/client';
    import type { DocumentShare } from '$lib/share/types.d';

  interface Props {
    user?: string;
    filterTags?: string[];
  }

  let { user = $profile?.id || $userStore?.id as string, filterTags = [] }: Props = $props();
    let documents = $derived(byUser(user));

    function normalize(s: string): string {
        return s.toLowerCase().replace(/[_\s]+/g, ' ').trim();
    }

    let normalizedFilterTags = $derived(filterTags.map(normalize).filter(Boolean));

    function matchesFilter(doc: any): boolean {
        if (normalizedFilterTags.length === 0) return true;
        const docTags: string[] = doc.metadata?.tags || [];
        return docTags.some((tag: string) => normalizedFilterTags.includes(normalize(tag)));
    }

    // Cache availability per job
    let cacheStatus: Record<string, boolean> = $state({});
    let shareCountMap: Map<string, number> = $state(new Map());

    onMount(async () => {
        // Check for pending import jobs
        const jobs = await checkPendingJobs();

        // Check cache availability for each job
        for (const job of jobs) {
            cacheStatus[job.id] = await hasFiles(job.id);
        }

        // Resume polling for active jobs
        for (const job of $activeJobs) {
            processJob(job.id).catch(() => {});
        }

        // Fetch share counts for badge display
        try {
            const myShares = await apiGet<DocumentShare[]>('/v1/share/my-shares');
            const m = new Map<string, number>();
            for (const s of myShares ?? []) {
                if (s.status !== 'revoked') m.set(s.document_id, (m.get(s.document_id) ?? 0) + 1);
            }
            shareCountMap = m;
        } catch { /* non-critical */ }
    });

    function sortByDate(a: any, b: any) {
        if (!a.metadata.date) return 1;
        if (!b.metadata.date) return -1;
        return new Date(b.metadata.date).getTime() - new Date(a.metadata.date).getTime();
    }

    function handleImport() {
        ui.emit('overlay.import', { autoOpen: true });
    }

    function handleReview(job: ImportJob) {
        // Open import overlay with job ID for resume
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
</script>

{#if $pendingJobs.length > 0}
<div class="pending-jobs">
    {#each $pendingJobs as job (job.id)}
        <JobCard
            {job}
            hasCachedFiles={cacheStatus[job.id] || false}
            onreview={handleReview}
            onretry={handleRetry}
            ondelete={handleDelete}
        />
    {/each}
</div>
{/if}

{#if $activeJobs.length > 0}
<div class="pending-jobs">
    {#each $activeJobs as job (job.id)}
        <JobCard
            {job}
            ondelete={handleDelete}
        />
    {/each}
</div>
{/if}

{#if $profileDocumentsLoading}
<Loading type="line" />
{:else if documents}
<div class="tiles">
    <div class="tile -import">
        <button  onclick={handleImport} class="button -secondary">
            <svg class="import-icon"><use href="/icons.svg#add-file" /></svg>
        
            { $t('app.nav.import') }
        </button>
    </div>
{#each $documents.filter(matchesFilter).sort(sortByDate) as document}
  <DocumentTile document={document as Document} shareCount={shareCountMap.get(document.id) ?? 0} />
{/each}
</div>
{/if}

<style>
    .pending-jobs {
        display: flex;
        flex-direction: column;
        gap: .5rem;
        margin-bottom: 1rem;
    }

    .tile.-import {
        background: transparent;
        cursor: pointer;
    }
    
    .tile.-import .import-icon {
        width: 2rem;
        height: 2rem;
        fill: currentColor;
        margin: .5rem;
    }
</style>

