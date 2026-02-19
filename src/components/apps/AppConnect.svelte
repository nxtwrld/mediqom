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

    let selectedApp: AppRecord | undefined = $state(undefined);

    let items = $derived(cleanItems(shared));

    $effect(() => {
        if (shared) logger.api.debug('Shared items', shared);
    });

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

    function download() {

        const file = JSON.parse(JSON.stringify(items[0]));

        const a = document.createElement('a');
        a.href = 'data:application/octet-stream,' + encodeURIComponent(JSON.stringify(file, null, 2));
        a.download = `${file.metadata.title} - ${file.metadata.date} - export.json`;
        a.click();
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
        {#if shared && false}
            <button onclick={share}>
                <svg class="app-icon">
                    <use xlink:href="/icons.svg#share"></use>
                </svg>
                <span>{$t('app.apps.share')}</span>
            </button>
        {/if}

        
        <button onclick={download}>
            <svg class="app-icon">
                <use xlink:href="/icons.svg#download"></use>
            </svg>
            <span>{$t('app.apps.download')}</span>
        </button>
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

    .apps :global(> button) {
        display: inline-block;
        width: 7rem;
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
        .apps :global(> button:hover) {
            background-color: var(--color-background-panel);
            color: black;
        }
    }


    .window {
        min-width: 20rem;
        max-width: calc(100vw - 2rem);
    }
    
</style>