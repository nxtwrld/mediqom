<script lang="ts">
    import { tick } from 'svelte';
    import { profile } from '$lib/profiles';
    import Documents from '$components/documents/Index.svelte';
    import ImportView from '$components/import/ImportView.svelte';
    import ProfileSectionTabs from '$components/layout/ProfileSectionTabs.svelte';
    import { activeJobs, pendingJobs, errorJobs } from '$lib/import/job-store';
    import { t } from '$lib/i18n';
    import { log } from '$lib/logging/logger';


    interface Props {
        //const documents = byUser($profile.id);
        data: {
        filters: {
            tags: string[];
        };
        importRequest: { jobId?: string; autoOpen: boolean } | null;
    };
    }

    let { data }: Props = $props();
    $effect(() => { log.ui.debug('data', data); });

    // shortcut: import jobs are not scoped to a profile (ImportJob has no profile_id), so running jobs show on every profile's Documents page — filter once jobs carry profile_id
    let importOpened = $state(false);
    let hasJobs = $derived($activeJobs.length + $pendingJobs.length + $errorJobs.length > 0);
    let showImport = $derived(!!data.importRequest || importOpened || hasJobs);

    async function addDocuments() {
        if (showImport) {
            document.getElementById('upload-file')?.click();
            return;
        }
        importOpened = true;
        await tick();
        document.getElementById('upload-file')?.click();
    }

    function handleImportComplete() {
        importOpened = false;
    }
</script>

<div class="page -empty">
    <ProfileSectionTabs group="docs" />
    <div class="heading">
        <h1 class="h1">{$t('app.nav.documents')}</h1>
        <div class="toolbar">
            <button class="button -primary" onclick={addDocuments}>
                {$t('app.import.add-files')}
            </button>
        </div>
    </div>

    {#if showImport}
        <section class="documents-import">
            <ImportView
                expandedJobId={data.importRequest?.jobId}
                autoOpen={data.importRequest?.autoOpen}
                oncomplete={handleImportComplete}
            />
        </section>
    {/if}

    <Documents user={$profile.id} filterTags={data.filters.tags} />

</div>

<style>
    .documents-import {
        margin-bottom: var(--ui-pad-large);
    }
</style>
