<script lang="ts">
    import { files, createTasks, detectPagesLayout } from '$lib/files';
    import { DocumentState, type Task, TaskState, type Document } from '$lib/import';
    import { DocumentType, type Document as SavedDocument } from '$lib/documents/types.d';
    import user, { type User } from '$lib/user';
    import { onMount } from 'svelte';
    import { t } from '$lib/i18n';
    import { isNativePlatform } from '$lib/config/platform';
    import { pickFromGallery, captureFromCamera } from '$lib/capacitor/file-picker';
    import DocumentView from '$components/documents/DocumentView.svelte';
    import SelectProfile from './SelectProfile.svelte';
    import { play } from '$components/ui/Sounds.svelte';
    import type { Profile } from '$lib/types.d';
    import { mergeNamesOnReports } from '$lib/profiles/tools';
    import ImportDocument from './ImportDocument.svelte';
    import ImportProfile from './ImportProfile.svelte';
    import ScreenOverlay from '$components/ui/ScreenOverlay.svelte';
    import LoaderThinking from '$components/ui/LoaderThinking.svelte';
    import DocumentTile from '$components/documents/DocumentTile.svelte';
    import JobProgressCard from './JobProgressCard.svelte';

    // Job-based import
    import { createJob, processJob, fetchJob, deleteJob, retryJob, checkPendingJobs, updateLayoutDetections } from '$lib/import/job-manager';
    import { assembleDocuments, saveDocuments, decryptJobResults } from '$lib/import/finalizer';
    import { getFiles as getCachedFiles, clearFiles, hasFiles } from '$lib/import/file-cache';
    import type { ImportJob } from '$lib/import/types';
    import { activeJobs, completedJobs, errorJobs, importJobs, importErrors, clearError, addError, formatImportError, addJob, removeJob, updateJob, replaceJob } from '$lib/import/job-store';
    import { get } from 'svelte/store';

    interface Props {
        /** If set, resume a previously created job instead of starting fresh */
        expandedJobId?: string;
        /** If true, auto-open the file picker dialog on mount */
        autoOpen?: boolean;
        /** Callback when import is fully complete (all docs saved) */
        oncomplete?: () => void;
    }

    let { expandedJobId, autoOpen, oncomplete }: Props = $props();

    // Document pool from all completed jobs
    let results: Document[] = $state([]);
    let byProfileDetected: {
        profile: Profile;
        reports: Document[];
    }[] = $state([]);
    let invalids: Document[] = $state([]);
    let savedDocuments: SavedDocument[] = $state([]);

    // File tracking
    let currentFiles: File[] = $state([]);
    let processingFiles: File[] = $state([]);

    // Loading states
    let isLoadingJobs = $state(true);
    let noCachedFiles = $state(false);

    // Track which job produced which documents (for cleanup after save)
    let docJobMap = new Map<Document, string>();

    // Map server job IDs to their placeholder keys for stable Svelte each-block keying
    let jobKeyMap = new Map<string, string>();

    function jobKey(job: ImportJob): string {
        return jobKeyMap.get(job.id) || job.id;
    }

    function fileInput(e: any) {
        files.set([...$files, ...e.target.files]);
    }

    async function handleGalleryPick() {
        const picked = await pickFromGallery().catch(() => []);
        if (picked.length > 0) files.set([...$files, ...picked]);
    }

    async function handleCameraCapture() {
        const photo = await captureFromCamera().catch(() => null);
        if (photo) files.set([...$files, photo]);
    }

    let fileUnsubscribe: (() => void) | null = null;

    onMount(() => {
        init();

        // Listen for file drops
        fileUnsubscribe = files.subscribe(value => {
            prepareFiles(value);
        });

        return () => {
            fileUnsubscribe?.();
        };
    });

    async function init() {
        // Load pending jobs from server if store is empty
        const current = get(importJobs);
        const jobs = current.length > 0 ? current : await checkPendingJobs();
        isLoadingJobs = false;

        // Resume polling for active jobs
        for (const job of jobs.filter(j => ['created', 'extracting', 'analyzing'].includes(j.status))) {
            processAndResolveJob(job.id);
        }

        // Load documents from completed jobs
        for (const job of jobs.filter(j => j.status === 'completed')) {
            await loadCompletedJobDocuments(job);
        }

        // If a specific job was requested, scroll to it / resume it
        if (expandedJobId) {
            const job = jobs.find(j => j.id === expandedJobId);
            if (job && job.status === 'completed') {
                await loadCompletedJobDocuments(job);
            } else if (job && ['created', 'extracting', 'analyzing'].includes(job.status)) {
                processAndResolveJob(job.id);
            }
        }

        // Auto-open file picker if requested
        if (autoOpen) {
            document.getElementById('upload-file')?.click();
        }
    }

    /** Load documents from a completed job into the shared pool */
    async function loadCompletedJobDocuments(job: ImportJob) {
        try {
            const cachedFiles = await getCachedFiles(job.id);
            if (!cachedFiles) noCachedFiles = true;

            const { extraction, analysis } = await decryptJobResults(
                job,
                user.keyPair?.privateKey ?? undefined,
            );

            const documents = await assembleDocuments(
                extraction,
                analysis,
                cachedFiles,
            );

            const validDocs = documents.filter(d => d.isMedical);
            const invalidDocs = documents.filter(d => !d.isMedical).map(d => {
                d.state = DocumentState.ERROR;
                return d;
            });

            // Track which job these docs came from
            for (const doc of validDocs) docJobMap.set(doc, job.id);

            results = [...results, ...validDocs];
            invalids = [...invalids, ...invalidDocs];
            byProfileDetected = mergeNamesOnReports(results as any) as any;
        } catch (error) {
            console.error('Failed to load job documents:', error);
            addError(formatImportError(error as Error), job.id);
        }
    }

    /** Process a job (SSE/polling) and load its documents when complete */
    async function processAndResolveJob(jobId: string) {
        try {
            const completedJob = await processJob(jobId, (event) => {
                // Log ocr_complete for diagnostics (no ONNX for resumed jobs — no task refs)
                if (event.stage === 'ocr_complete') {
                    const pages = event.data?.pagesWithImages;
                    console.log(`[Import] ocr_complete (resumed): fileIndex=${event.data?.fileIndex}, pagesWithImages=[${pages?.join(', ') ?? 'none'}]`);
                }
            });
            updateJob(jobId, { status: 'loading', message: null } as any);
            await loadCompletedJobDocuments(completedJob);
            removeJob(jobId);
            jobKeyMap.delete(jobId);
            play('focus');
        } catch (error) {
            // Silently ignore abort errors (job was deleted/cancelled)
            if (error instanceof DOMException && error.name === 'AbortError') return;
            console.error('Job processing failed:', error);
            updateJob(jobId, { status: 'error', error: String(error) } as any);
            play('error');
        }
    }

    // ── File intake (from Index.svelte) ──────────────────────────────

    function prepareFiles(value: File[]) {
        if (value.length > 0) {
            const merged = mergeFiles(value);
            const toBeProcessed = merged.filter(file => !processingFiles.includes(file));
            if (toBeProcessed.length > 0) {
                currentFiles = merged;
                play('focus');
                processingFiles = [...processingFiles, ...toBeProcessed];
                analyze(toBeProcessed);
            } else {
                play('error');
            }
            files.set([]);
        }
    }

    function mergeFiles(incoming: File[]) {
        const filtered = incoming.filter(file => {
            return !currentFiles.some(f => f.name === file.name && f.size === file.size);
        });
        return [...currentFiles, ...filtered];
    }

    async function analyze(filesToProcess: File[]) {
        // Show immediate feedback with a placeholder job
        const placeholderId = `preparing-${crypto.randomUUID()}`;
        const placeholderJob: ImportJob = {
            id: placeholderId,
            user_id: '',
            status: 'preparing',
            stage: null,
            progress: 0,
            message: null,
            error: null,
            scan_deducted: false,
            processing_started_at: null,
            file_count: filesToProcess.length,
            file_manifest: [],
            language: '',
            extraction_result: null,
            analysis_results: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            expires_at: '',
        };
        addJob(placeholderJob);

        const newTasks = await createTasks(filesToProcess);

        try {
            const language = ($user as User)?.language || 'English';
            const filesToCache = newTasks.flatMap(t => t.files as File[]);
            const newJob = await createJob(newTasks, filesToCache, language, placeholderId);
            const jobId = newJob.id;
            // Set stable key mapping BEFORE updating store so Svelte sees same key
            jobKeyMap.set(jobId, placeholderId);
            replaceJob(placeholderId, newJob);

            // Layout detection is now triggered reactively by the server's ocr_complete SSE event
            const completedJob = await processJob(jobId, (event) => {
                if (event.stage === 'ocr_complete') {
                    const pages = event.data?.pagesWithImages;
                    console.log(`[Import] ocr_complete: fileIndex=${event.data?.fileIndex}, pagesWithImages=[${pages?.join(', ') ?? 'none'}]`);

                    if (pages?.length > 0) {
                        const { fileIndex, pagesWithImages } = event.data;
                        const task = newTasks[fileIndex];
                        if (task) {
                            detectPagesLayout(task, pagesWithImages).then((detections) => {
                                console.log(`[LayoutDetection] Got ${detections.length} detection(s) for fileIndex=${fileIndex}`);
                                if (detections.length > 0) {
                                    updateLayoutDetections(jobId, newTasks);
                                }
                            }).catch((err) => console.warn('[LayoutDetection] Detection failed:', err));
                        } else {
                            console.warn(`[Import] ocr_complete: no task at fileIndex=${fileIndex} (have ${newTasks.length} tasks)`);
                        }
                    }
                }
            });

            // Show loading state while assembling documents
            updateJob(jobId, { status: 'loading', message: null } as any);

            try {
                await loadCompletedJobDocuments(completedJob);
                removeJob(jobId);
                jobKeyMap.delete(jobId);
                removeFiles(filesToProcess);
                play('focus');
            } catch (docError) {
                updateJob(jobId, { status: 'error', error: String(docError) } as any);
                play('error');
                removeFiles(filesToProcess);
            }
        } catch (error) {
            // Silently ignore abort errors (job was deleted/cancelled)
            if (error instanceof DOMException && error.name === 'AbortError') {
                removeFiles(filesToProcess);
                return;
            }
            console.error('Import job failed:', error);
            updateJob(placeholderId, { status: 'error', error: String(error) } as any);
            play('error');
            removeFiles(filesToProcess);
        }
    }

    function removeFiles(toRemove: File[]) {
        currentFiles = currentFiles.filter(file => !toRemove.includes(file));
        processingFiles = processingFiles.filter(file => !toRemove.includes(file));
    }

    // ── Document pool management ─────────────────────────────────────

    function removeItem(type: 'results' | 'invalids', item: any) {
        if (type === 'results') {
            results = results.filter(doc => doc !== item);
            byProfileDetected = byProfileDetected
                .map(pd => ({ ...pd, reports: pd.reports.filter(doc => doc !== item) }))
                .filter(pd => pd.reports.length > 0);
            docJobMap.delete(item);
        } else {
            invalids = invalids.filter(doc => doc !== item);
        }
    }

    // ── Per-document save ────────────────────────────────────────────

    let savingDocs = $state(new Set<Document>());

    async function saveDocument(doc: Document, profileDetected: { profile: Profile; reports: Document[] }) {
        savingDocs = new Set([...savingDocs, doc]);

        try {
            const saved = await saveDocuments([{ profile: profileDetected.profile, reports: [doc] }]);
            savedDocuments = [...savedDocuments, ...saved];

            // Remove from pool
            removeItem('results', doc);

            // If all docs from this job are saved, clean up the job
            const jobId = docJobMap.get(doc);
            if (jobId) {
                const remainingFromJob = [...docJobMap.entries()].filter(([, jId]) => jId === jobId);
                if (remainingFromJob.length === 0) {
                    await deleteJob(jobId).catch((e) => console.warn('[Import] Failed to delete job:', e));
                }
            }

            play('focus');
        } catch (error) {
            console.error('Failed to save document:', error);
            addError(formatImportError(error as Error));
        } finally {
            savingDocs = new Set([...savingDocs].filter(d => d !== doc));
        }
    }

    // ── Save all ─────────────────────────────────────────────────────

    let savingAll = $state(false);

    async function saveAll() {
        savingAll = true;
        try {
            const saved = await saveDocuments(byProfileDetected);
            savedDocuments = [...savedDocuments, ...saved];
            byProfileDetected = [];
            results = [];

            // Clean up all jobs that had documents
            const jobIds = new Set(docJobMap.values());
            docJobMap.clear();
            for (const jobId of jobIds) {
                await deleteJob(jobId).catch((e) => console.warn('[Import] Failed to delete job:', e));
            }

            oncomplete?.();
        } catch (error) {
            console.error('Failed to save documents:', error);
            addError(formatImportError(error as Error));
        } finally {
            setTimeout(() => { savingAll = false; }, 500);
        }
    }

    // ── Job actions ──────────────────────────────────────────────────

    async function handleRetry(job: ImportJob) {
        await retryJob(job.id);
        processAndResolveJob(job.id);
    }

    async function handleDelete(job: ImportJob) {
        await deleteJob(job.id);
        jobKeyMap.delete(job.id);
    }

    // ── Preview ──────────────────────────────────────────────────────

    let previewReport: Document | null = $state(null);

    // ── Derived ──────────────────────────────────────────────────────

    let hasActiveJobs = $derived($activeJobs.length > 0);
    let hasErrorJobs = $derived($errorJobs.length > 0);
    let hasDocuments = $derived(byProfileDetected.length > 0);
    let hasAnything = $derived(hasActiveJobs || hasErrorJobs || hasDocuments || invalids.length > 0 || savedDocuments.length > 0);
    let remainingScans = $derived((($user as User)?.subscriptionStats?.scans || 0));
</script>

<div class="import-view">
    <!-- Header -->
    <div class="import-header">
        <h2>{$t('app.nav.import')}</h2>
        <div class="header-actions">
            <label for="upload-file" class="button -small -primary">
                <svg class="btn-icon"><use href="/icons.svg#add-file" /></svg>
                {$t('app.import.add-files')}
            </label>
            {#if isNativePlatform()}
                <button class="button -small" onclick={handleCameraCapture} aria-label="Take photo">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                    </svg>
                </button>
                <button class="button -small" onclick={handleGalleryPick} aria-label="Pick from gallery">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                </button>
            {/if}
        </div>
    </div>

    <input type="file" id="upload-file" class="-none" multiple onchange={fileInput} />

    <!-- Error banners -->
    {#if $importErrors.length > 0}
        <div class="error-banners">
            {#each $importErrors as err (err.id)}
                <div class="error-banner">
                    <span>{err.message}</span>
                    <button class="dismiss-btn" onclick={() => clearError(err.id)} aria-label="Dismiss">
                        <svg viewBox="0 0 24 24" width="14" height="14"><use href="/icons.svg#close" /></svg>
                    </button>
                </div>
            {/each}
        </div>
    {/if}

    {#if noCachedFiles && hasDocuments}
        <div class="alert -info">
            {$t('app.import.no-cached-files-warning')}
        </div>
    {/if}

    <!-- Scans remaining -->
    {#if ($user as User)?.subscriptionStats?.scans <= 0}
        <div class="alert -warning">
            {$t('app.import.maxium-scans-reached', { values: {
                limit: ($user as User)?.subscriptionStats?.scans
            }})} {$t('app.upgrade.please-upgrade-your-subscription-to-continue')}
        </div>
    {/if}

    <div class="import-body">
        <!-- Active jobs section -->
        {#if hasActiveJobs || hasErrorJobs}
            <div class="jobs-section">
                {#each $activeJobs as job (jobKey(job))}
                    <JobProgressCard {job} ondelete={handleDelete} />
                {/each}
                {#each $errorJobs as job (jobKey(job))}
                    <JobProgressCard {job} onretry={handleRetry} ondelete={handleDelete} />
                {/each}
            </div>
        {/if}

        <!-- Document pool -->
        {#if hasDocuments || invalids.length > 0 || savedDocuments.length > 0}
            <div class="documents-section">
                {#if hasDocuments}
                    <h3 class="section-heading">{$t('app.import.section-ready')}</h3>
                {/if}

                <div class="imports">
                    {#each savedDocuments as doc}
                        <div class="report-done">
                            <DocumentTile document={doc} />
                        </div>
                    {/each}

                    {#each byProfileDetected as profileDetected}
                        <ImportProfile bind:profile={profileDetected.profile} />
                        {#each profileDetected.reports as doc}
                            <div class="report-import">
                                <ImportDocument {doc} onclick={() => previewReport = doc} onremove={() => removeItem('results', doc)} />
                                {#key JSON.stringify(profileDetected.profile)}
                                    <SelectProfile contact={profileDetected.profile} bind:selected={profileDetected.profile} />
                                {/key}
                                <button
                                    class="button -small -primary save-doc-btn"
                                    onclick={() => saveDocument(doc, profileDetected)}
                                    disabled={savingDocs.has(doc)}
                                >
                                    {#if savingDocs.has(doc)}
                                        <LoaderThinking />
                                    {:else}
                                        {$t('app.buttons.save')}
                                    {/if}
                                </button>
                            </div>
                        {/each}
                    {/each}

                    {#each invalids as doc}
                        <div class="report-import">
                            <ImportDocument {doc} onremove={() => removeItem('invalids', doc)} />
                        </div>
                    {/each}
                </div>

                {#if hasDocuments}
                    <div class="save-all-bar">
                        <p class="scans-info">{$t('app.import.you-still-have-scans-in-your-yearly-subscription', { values: { scans: remainingScans }})}</p>
                        <button class="button -primary -large" onclick={saveAll} disabled={savingAll || results.length === 0}>
                            {#if savingAll}
                                <LoaderThinking />
                            {:else}
                                {$t('app.import.save')} ({results.length})
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Empty state -->
        {#if !hasAnything && !isLoadingJobs && !hasActiveJobs}
            <div class="empty-state">
                <svg viewBox="0 0 24 24" class="empty-icon">
                    <use href="/icons.svg#add-file" />
                </svg>
                <p>{$t('app.import.drop-files-here')}</p>
            </div>
        {/if}

        <!-- Loading state -->
        {#if isLoadingJobs}
            <div class="loading-state">
                <LoaderThinking />
                <p>{$t('app.import.loading-job')}</p>
            </div>
        {/if}
    </div>
</div>

{#if previewReport}
    <ScreenOverlay title={previewReport.content.title} preventer={true} on:close={() => previewReport = null}>
        <DocumentView document={{
            id: crypto.randomUUID(),
            key: '',
            user_id: '',
            owner_id: '',
            type: DocumentType.document,
            metadata: previewReport.metadata || {
                title: previewReport.content.title,
                tags: previewReport.content.tags,
                date: previewReport.content.date
            },
            content: previewReport.content,
            attachments: []
        } as SavedDocument} />
    </ScreenOverlay>
{/if}

<style>
    .import-view {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow-y: auto;
    }

    .import-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ui-pad-medium);
        flex-shrink: 0;
    }

    .import-header h2 {
        margin: 0;
    }

    .header-actions {
        display: flex;
        gap: var(--ui-pad-small);
        align-items: center;
    }

    .btn-icon {
        width: 1.1rem;
        height: 1.1rem;
        fill: currentColor;
        margin-right: 0.2rem;
    }

    /* Error banners */
    .error-banners {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0 var(--ui-pad-medium);
    }

    .error-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        background-color: color-mix(in srgb, var(--color-negative) 12%, transparent);
        border: 1px solid var(--color-negative);
        border-radius: var(--ui-radius-small);
        font-size: 0.85rem;
        color: var(--color-negative);
    }

    .dismiss-btn {
        padding: 0.2rem;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-negative);
        flex-shrink: 0;
    }
    .dismiss-btn svg {
        fill: currentColor;
    }

    .alert {
        margin: 0 var(--ui-pad-medium) var(--ui-pad-small);
        padding: 0.75rem 1rem;
        border-radius: var(--ui-radius-small);
        font-size: 0.85rem;
    }
    .alert.-info {
        background-color: var(--color-blue-100, #e0f0ff);
    }
    .alert.-warning {
        background-color: color-mix(in srgb, var(--color-warning) 15%, transparent);
        border: 1px solid var(--color-warning);
    }

    .import-body {
        flex: 1;
        padding: 0 var(--ui-pad-medium);
        overflow-y: auto;
    }

    /* Jobs section */
    .jobs-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: var(--ui-pad-large);
    }

    /* Documents section */
    .documents-section {
        margin-bottom: var(--ui-pad-medium);
    }

    .section-heading {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin: var(--ui-pad-medium) 0 var(--ui-pad-small);
    }

    .imports {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: center;
        gap: 1rem;
        --border-width: 0.2rem;
        --radius: var(--radius-8);
        --tile-height: 13rem;
    }

    .report-import {
        width: 8rem;
        min-height: 20rem;
    }

    .report-done {
        width: 12rem;
        background-color: var(--color-gray-300);
    }

    .save-doc-btn {
        width: 100%;
        margin-top: 0.25rem;
    }

    .save-doc-btn :global(.loader) {
        --color: var(--color-white);
        height: 1em;
    }

    /* Save all bar */
    .save-all-bar {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ui-pad-small);
        padding: var(--ui-pad-medium);
        margin-top: var(--ui-pad-medium);
    }

    .scans-info {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        margin: 0;
    }

    /* Empty state */
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ui-pad-xlarge);
        min-height: 40vh;
        color: var(--color-text-secondary);
    }

    .empty-icon {
        width: 4rem;
        height: 4rem;
        fill: var(--color-gray-500);
        margin-bottom: var(--ui-pad-medium);
    }

    .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ui-pad-xlarge);
        min-height: 30vh;
    }
</style>
