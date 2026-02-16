
<script lang="ts">
    import { files, createTasks } from '$lib/files';
    import { DocumentState, type Task, TaskState, type Document  } from '$lib/import';
    import { DocumentType, type Document as SavedDocument } from '$lib/documents/types.d';
    import  user, { type User } from '$lib/user';
    import { onMount } from 'svelte';
    import { t } from '$lib/i18n';
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
    import DualStageProgress from './DualStageProgress.svelte';

    // Job-based import
    import { createJob, processJob, fetchJob, deleteJob } from '$lib/import/job-manager';
    import { assembleDocuments, saveDocuments, decryptJobResults } from '$lib/import/finalizer';
    import { getFiles as getCachedFiles, clearFiles } from '$lib/import/file-cache';
    import type { ImportJob } from '$lib/import/types';

    interface Props {
        /** If set, resume a previously created job instead of starting fresh */
        jobId?: string;
        /** Callback when import is fully complete (all docs saved) */
        oncomplete?: () => void;
    }

    let { jobId, oncomplete }: Props = $props();

    let results: Document[] = $state([]);
    let byProfileDetected: {
        profile: Profile,
        reports: Document[]
    }[] = $state([]);
    let invalids: Document[]= $state([]);
    let tasks: Task[] = $state([]);
    let savedDocuments: SavedDocument[] = $state([]);

    let currentFiles: File[] = $state([]);
    let processingFiles: File[] = $state([]);
    let processedCount: number = $state(0);

    let currentStage: 'extract' | 'analyze' | null = $state(null);
    let stageProgress = $state(0);

    // Current job tracking
    let currentJobId: string | null = $state(jobId || null);
    let noCachedFiles = $state(false);
    let isResuming = $state(false);

    enum AssessingState {
        IDLE = 'IDLE',
        ASSESSING = 'ASSESSING',
    }

    enum ProcessingState {
        IDLE = 'IDLE',
        PROCESSING = 'PROCESSING',
    }
    let processingState = $state(ProcessingState.IDLE);
    let assessingState = $state(AssessingState.IDLE);

    function fileInput(e: any) {
        files.set([...$files, ...e.target.files]);
    }

    onMount(() => {
        // If resuming a job, load its results
        if (jobId) {
            resumeJob(jobId);
            return () => {};
        }

        // Normal mode: listen for file drops
        const unsubscribe = files.subscribe(value => {
            prepareFiles(value);
        });
        return () => {
            unsubscribe();
            clearAll();
        }
    });

    function clearAll() {
        files.set([]);
        results = [];
        byProfileDetected = [];
        invalids = [];
        tasks = [];
        currentFiles = [];
        processingFiles = [];
        processedCount = 0;
        processingState = ProcessingState.IDLE;
        assessingState = AssessingState.IDLE;
        currentJobId = null;
    }

    /** Resume a completed/in-progress job */
    async function resumeJob(id: string) {
        try {
            isResuming = true;

            const job = await fetchJob(id);
            if (!job) return;

            currentJobId = id;

            if (job.status === 'completed') {
                // Job completed - show review UI
                const cachedFiles = await getCachedFiles(id);
                noCachedFiles = !cachedFiles;

                // Use decryptJobResults to handle both encrypted and plaintext jobs
                const { extraction, analysis } = await decryptJobResults(job);

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

                results = validDocs;
                invalids = invalidDocs;
                byProfileDetected = mergeNamesOnReports(results as any) as any;
            } else if (['created', 'extracting', 'analyzing'].includes(job.status)) {
                // Still processing - start listening
                isResuming = false;
                assessingState = AssessingState.ASSESSING;
                processingState = ProcessingState.PROCESSING;

                await processJob(id, (event) => {
                    if (event.stage.includes('extract') || event.stage === 'initialization') {
                        currentStage = 'extract';
                    } else if (event.stage.includes('analyz')) {
                        currentStage = 'analyze';
                    }
                    stageProgress = event.progress;
                });

                // Processing done - reload results
                await resumeJob(id);
            }
        } catch (error) {
            console.error('Failed to resume job:', error);
            play('error');
        } finally {
            isResuming = false;
            assessingState = AssessingState.IDLE;
            processingState = ProcessingState.IDLE;
            currentStage = null;
            stageProgress = 0;
        }
    }

    function prepareFiles(value: File[]) {
        if (value.length > 0) {
            currentFiles = mergeFiles(value);
            const toBeProcessed = currentFiles.filter(file => !processingFiles.includes(file));
            if (toBeProcessed.length > 0) {
                play('focus');
                processingFiles = [...processingFiles, ...toBeProcessed];
                analyze(toBeProcessed);
            } else  {
                play('error');
            }
            files.set([]);
        }
    }

    function mergeFiles(files: File[]) {
        files = files.filter(file => {
            return !currentFiles.some(f => f.name === file.name && f.size === file.size);
        });
        return [...currentFiles, ...files];
    }

    async function analyze(filesToProcess: File[]) {
        const newTasks = await createTasks(filesToProcess);
        tasks = [...tasks, ...newTasks];

        await analyzeWithJob(filesToProcess, newTasks);
    }

    /** New job-based analysis flow */
    async function analyzeWithJob(filesToProcess: File[], newTasks: Task[]) {
        try {
            assessingState = AssessingState.ASSESSING;
            processingState = ProcessingState.PROCESSING;

            const language = ($user as User)?.language || 'English';

            // Create persistent job — use task files (possibly decrypted clones) for caching
            const filesToCache = newTasks.flatMap(t => t.files as File[]);
            const id = await createJob(newTasks, filesToCache, language);
            currentJobId = id;

            // Process with SSE + polling fallback
            const completedJob = await processJob(id, (event) => {
                if (event.stage.includes('extract') || event.stage === 'initialization') {
                    currentStage = 'extract';
                } else if (event.stage.includes('analyz')) {
                    currentStage = 'analyze';
                }
                stageProgress = event.progress;
            });

            // Assemble documents from results
            const cachedFiles = await getCachedFiles(id);

            // Use decryptJobResults to handle both encrypted and plaintext jobs
            const { extraction, analysis } = await decryptJobResults(completedJob);

            console.log('Normal flow - extraction:', extraction);
            console.log('Normal flow - analysis:', analysis);
            console.log('Normal flow - extraction type:', Array.isArray(extraction));
            console.log('Normal flow - analysis type:', Array.isArray(analysis));

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

            results = [...results, ...validDocs];
            invalids = [...invalids, ...invalidDocs];
            byProfileDetected = mergeNamesOnReports(results as any) as any;

            // Clean up task UI
            const processedTaskFiles = new Set(filesToProcess.map(f => f.name + f.size));
            tasks = tasks.filter(task => {
                const taskFileIds = task.files.map((f: File) => f.name + f.size);
                return !taskFileIds.some(id => processedTaskFiles.has(id));
            });
            removeFiles(filesToProcess);

            play('focus');

        } catch (error) {
            console.error('Import job failed:', error);
            play('error');
            removeFiles(filesToProcess);
        } finally {
            assessingState = AssessingState.IDLE;
            processingState = ProcessingState.IDLE;
            currentStage = null;
            stageProgress = 0;
        }
    }

    function removeItem(type: 'tasks' | 'results' | 'invalids', item: any) {
        switch(type) {
            case 'tasks':
                removeFiles(item.files);
                tasks = tasks.filter(task => task !== item);
                break;
            case 'results':
                results = results.filter(doc => doc !== item);
                byProfileDetected = [
                    ...byProfileDetected.map(profileDetected => {
                        profileDetected.reports = profileDetected.reports.filter(doc => doc !== item);
                        return profileDetected;
                    })
                ]
                break;
            case 'invalids':
                invalids = invalids.filter(doc => doc !== item);
               break;
        }
    }

    function removeFiles(files: File[]) {
        currentFiles = [...currentFiles.filter(file => !files.includes(file))];
        processingFiles = [...processingFiles.filter(file => !files.includes(file))];
    }

    let savingDocumentsInProgress: boolean = $state(false);

    async function add() {
        savingDocumentsInProgress = true;

        try {
            const saved = await saveDocuments(byProfileDetected);
            savedDocuments = [...savedDocuments, ...saved];
            byProfileDetected = [];
            results = [];

            // Clean up the job and cached files
            if (currentJobId) {
                await deleteJob(currentJobId);
                currentJobId = null;
            }

            oncomplete?.();
        } catch (error) {
            console.error('Failed to save documents:', error);
        } finally {
            setTimeout(() => {
                savingDocumentsInProgress = false;
            }, 500);
        }
    }

    let previewReport: Document | null = $state(null);

    let analyzingInProgress = $derived((assessingState as string) === 'ASSESSING' || (processingState as string) === 'PROCESSING');
    let remainingScans = $derived((($user as User)?.subscriptionStats?.scans || 0) - processedCount);
</script>

<div class="page -empty">
{#if isResuming}
    <div class="resume-loading">
        <LoaderThinking />
        <p>{$t('app.import.preparing-documents')}</p>
    </div>
{:else if ($user as User)?.subscriptionStats?.scans <= 0}
    <div class="alert -warning">
        { $t('app.import.maxium-scans-reached', { values: {
            limit: ($user as User)?.subscriptionStats?.scans
        }}) } { $t('app.upgrade.please-upgrade-your-subscription-to-continue') }
    </div>
{:else}

    <h3 class="h3 heading">{ $t('app.import.import-reports-scan-or-images') }</h3>

    {#if noCachedFiles && byProfileDetected.length > 0}
        <div class="alert -info">
            { $t('app.import.no-cached-files-warning') }
        </div>
    {/if}

    <input type="file" id="upload-file" class="-none" accept=".pdf,.jpg,.jpeg,.png,.webp,.webm" onchange={fileInput} />

    <div class="import-canvas">
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
                        <SelectProfile contact={profileDetected.profile} bind:selected={profileDetected.profile}  />
                        {/key}
                    </div>
                {/each}
            {/each}

            {#each invalids as doc}
            <div class="report-import">
                <ImportDocument {doc} onremove={() => removeItem('invalids', doc)} />
            </div>
            {/each}
            {#each tasks as task (task.title + task.files?.[0]?.size)}
            <div class="report-import">
                <ImportDocument doc={task} onremove={() => removeItem('tasks', task)} />
            </div>
            {/each}
            {#if !jobId}
            <div class="report-import">
            <label for="upload-file" class="button report">
                <div class="preview">
                    <svg>
                        <use href="/icons.svg#add-file" />
                    </svg>
                </div>

                <div class="title">
                    { $t('app.import.add-files') }
                </div>
            </label>
            </div>
            {/if}
        </div>
    </div>
    <div class="controls">
        <p>{ $t('app.import.you-still-have-scans-in-your-yearly-subscription', { values: { scans: remainingScans} }) }</p>
        <div class="actions">

            {#if tasks.length > 0 || analyzingInProgress}
            <button class="button -primary -large" disabled={tasks.length == 0 || analyzingInProgress}>
                {#if analyzingInProgress}
                    <div class="button-loading">
                        {#if currentStage}
                            <DualStageProgress
                                overallProgress={stageProgress}
                                currentStage={currentStage || 'extract'}
                                extractProgress={currentStage === 'extract' ? stageProgress : 100}
                                analyzeProgress={currentStage === 'analyze' ? stageProgress : 0}
                                currentMessage={currentStage === 'extract' ? $t('app.import.extracting-text-and-data') : $t('app.import.analyzing-medical-content')}
                                filesTotal={processingFiles.length}
                                filesCompleted={processedCount}
                            />
                        {:else}
                            <LoaderThinking />
                        {/if}
                    </div>
                {:else}
                    { $t('app.import.analyze-reports') }
                {/if}
            </button>
            {/if}
            {#if byProfileDetected.length > 0 && !analyzingInProgress}
            <button class="button -large" onclick={add} disabled={results.length == 0 || savingDocumentsInProgress}>
                {#if savingDocumentsInProgress}
                    <div class="button-loading">
                        <LoaderThinking />
                    </div>
                {:else}
                    { $t('app.import.save') }
                {/if}
            </button>
            {/if}

        </div>
    </div>

{/if}

</div>
{#if previewReport}
    <ScreenOverlay title={previewReport.content.title} preventer={true} on:close={() => previewReport = null}>
        <!-- Convert import Document to SavedDocument format for DocumentView -->
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

    .import-canvas {
        display: flex;
        align-items: center;
        justify-content: center;
        height: calc(100vh - var(--heading-height) - var(--toolbar-height) - 10rem);
    }

    .button-loading {
        --color: var(--color-white);
        width: 100%;
        height: 1.2em;
    }

    .resume-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: calc(100vh - var(--heading-height) - var(--toolbar-height));
        padding: 2rem;
    }

    .imports {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: center;
        gap: 1rem;

        overflow-y: auto;
        --border-width: .2rem;
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

    .report {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        padding: 0;
        height: var(--tile-height);
        background-color: var(--color-background);
        border: var(--border-width) solid var(--color-background);
        border-radius: var(--radius);
    }
    .report .preview {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        widtH: 100%;
        height: 8rem;
        padding: 1rem;
        overflow: hidden;

    }
    .report .preview svg {
        width: 100%;
        height: 100%;
        fill: var(--color-interactivity);
    }

    .report .title {
        display: flex;
        justify-content: center;
        text-wrap: wrap;
        align-items: center;
        padding: .5rem;
        text-align: center;
        font-size: .8rem;
        height: 4rem;
        font-weight: bold;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .controls {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        height: 10rem;
        background-color: var(--color-background);
    }
    .controls .actions {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 1rem;
    }

    .alert.-info {
        padding: .75rem 1rem;
        margin: 0 1rem;
        background-color: var(--color-blue-100, #e0f0ff);
        border-radius: var(--radius-8);
        font-size: .85rem;
    }

</style>
