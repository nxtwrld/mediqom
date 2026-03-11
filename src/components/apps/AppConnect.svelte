<script lang="ts">
    import apps, { sharedItems } from '$lib/apps/store';
    import { AppConnectionType, type AppConnectionType as AppConnectionTypeEnum, type AppRecord } from '$lib/apps/types.d';
    import Modal from '$components/ui/Modal.svelte';
	import Share from './Share.svelte';
    //import { getAllLinkedItems, type Item } from "$lib/common.utils";
    import AppGet from './AppGet.svelte';
    //import type { Link } from "$lib/common.types.d";
    import './style.css';
    import { logger } from '$lib/logging/logger';
    import { t } from '$lib/i18n';
    import { downloadPdf } from '$lib/export/pdf';
    import { createEncryptedBackup, downloadBackup } from '$lib/export/backup';
    import profile from '$lib/profiles/profile';
    import Popover from '$components/ui/Popover.svelte';

    interface Props {
        type?: AppConnectionTypeEnum;
        shared?: any | undefined;
        tags?: string[];
        children?: import('svelte').Snippet;
    }

    let {
        type = AppConnectionType.Report,
        shared = undefined,
        tags = [],
        children
    }: Props = $props();

    let showLeavingWarning: boolean = $state(false);
    let showShareDialog: boolean = $state(false);
    let showDownloadMenu: boolean = $state(false);

    let selectedApp: AppRecord | undefined = $state(undefined);

    let items = $derived(cleanItems(shared));

    function cleanItems(items: any[]): any[] {
        return items.map(item => {
            // Create a deep copy to avoid mutating the original
            const cleanItem = JSON.parse(JSON.stringify(item));

            if (cleanItem.content.signals) {
                cleanItem.content.signals.forEach((signal: any) => {
                    delete signal.document;
                });
            }
            delete cleanItem.key;
            delete cleanItem.attachments;
            delete cleanItem.content.attachments;

            return cleanItem;
        });
    }



    function openApp(app: AppRecord) {
        selectedApp = app;
        showLeavingWarning = true;

    }

    function abort() {
        showShareDialog = false;
        showLeavingWarning = false;
        selectedApp = undefined;
        //sharedItems.set([]);
    }
/*
    function confirm() {
        if(selectedApp) {
            sharedItems.set(items);
            const uid = selectedApp.uid;
            abort();
            setTimeout(() => {
                goto('/app/' + uid);
            }, 500);


        }
    }*/

    function share() {
        showShareDialog = true;
    }

    function toggleDownloadMenu() {
        showDownloadMenu = !showDownloadMenu;
    }

    function closeDownloadMenu() {
        showDownloadMenu = false;
    }

    function downloadJson() {
        closeDownloadMenu();
        const file = JSON.parse(JSON.stringify(items[0]));
        const a = document.createElement('a');
        a.href = 'data:application/octet-stream,' + encodeURIComponent(JSON.stringify(file, null, 2));
        a.download = `${file.metadata.title} - ${file.metadata.date} - export.json`;
        a.click();
    }

    async function downloadPdfReport() {
        closeDownloadMenu();
        await downloadPdf(shared[0], $profile);
    }

    async function downloadEncryptedBackup() {
        closeDownloadMenu();
        const pub = $profile?.publicKey;
        if (!pub) {
            logger.api.warn('No public key available for encrypted backup');
            return;
        }
        const backup = await createEncryptedBackup(items[0], pub);
        downloadBackup(backup);
    }

    function filterApps(app: AppRecord) {
        // check if
        if (app.requires.length > 0) {
            // check passed tags if at least one is in the requires
            //console.log(app.requires, tags)
            if (!app.requires.some(r => tags.includes(r))) return false;
        }
        return app.connections.includes(type);
    }


</script>


<div class="apps">
        {#if shared}
            <button onclick={share}>
                <svg class="app-icon">
                    <use href="/icons.svg#share"></use>
                </svg>
                <span>{$t('app.apps.share')}</span>
            </button>
        {/if}

        <Popover bind:open={showDownloadMenu} placement="top">
            {#snippet trigger()}
                <button onclick={toggleDownloadMenu}>
                    <svg class="app-icon">
                        <use href="/icons.svg#download"></use>
                    </svg>
                    <span>{$t('app.apps.download')}</span>
                </button>
            {/snippet}
            <button class="download-item" role="menuitem" onclick={downloadPdfReport}>
                <span class="download-item-icon">📄</span>
                <span>PDF Report</span>
            </button>
            <button class="download-item" role="menuitem" onclick={downloadJson}>
                <span class="download-item-icon">{'{}'}</span>
                <span>JSON (Raw)</span>
            </button>
            <button class="download-item" role="menuitem" onclick={downloadEncryptedBackup}>
                <span class="download-item-icon">🔒</span>
                <span>Backup (Encrypted)</span>
            </button>
        </Popover>

    {@render children?.()}
{#each $apps.filter(filterApps) as app}
        <button onclick={() => openApp(app)} >
            <img src={app.icon} loading="lazy" alt={app.name} class="app-icon" />
            <span>{app.name}</span>
            <span class="app-credits">{app.credits}</span>
        </button>
{/each}



</div>

{#if showLeavingWarning && selectedApp !== undefined}
    <Modal onclose={abort}>
        <div class="window">
        <AppGet app={selectedApp} items={cleanItems(items)} on:abort={abort} />
        </div>
    </Modal>
{/if}

{#if showShareDialog && shared !== undefined}
    <Modal onclose={abort}>
        <div class="window">
            <Share on:share={abort} on:abort={abort}  items={cleanItems(items)} />
        </div>
    </Modal>
{/if}


<style>
    .apps {
        display: flex;
        flex-wrap: nowrap;
        justify-content: flex-start;
        width: 100%;
        overflow-x: auto;
        height: 7rem;
        margin-bottom: var(--gap);
        background-color: rgba(21, 21, 21, 0.7);
         }

    .apps :global(> button),
    .apps :global(> .popover-wrapper > button) {
        display: inline-block;
        width: 7rem;
        height: 100%;
        padding: 0.5rem;
        text-align: center;
        color: #FFF;
        transition: all .2s ease-in-out;
        position: relative;
    }

    .app-credits {
        position: absolute;
        border-radius: var(--border-radius);
        top: .5rem;
        right: .5rem;
        font-size: .8rem;
        background-color: var(--color-highlight);
        padding: .2rem .5rem
    }
    @media (hover: hover) {
        .apps :global(> button:hover),
        .apps :global(> .popover-wrapper > button:hover) {
            background-color: var(--color-background-panel);
            color: black;
        }
    }


    .window {
        min-width: 20rem;
        max-width: calc(100vw - 2rem);
    }

    .download-item {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        padding: 0.55rem 1rem;
        text-align: left;
        color: var(--color-text-primary);
        background: none;
        border: none;
        cursor: pointer;
        font-size: 0.85rem;
        white-space: nowrap;
        border-radius: var(--ui-radius-small);
    }

    @media (hover: hover) {
        .download-item:hover { background: var(--color-surface); }
    }

    .download-item-icon {
        width: 1.2rem;
        text-align: center;
        flex-shrink: 0;
    }

</style>