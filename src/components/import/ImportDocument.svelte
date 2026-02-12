<script lang="ts">
    import { stopPropagation } from 'svelte/legacy';


    import { type Document, DocumentState, type Task, TaskState }  from '$lib/import';
    import ScanningAnimation from '$components/import/ScanningAnimation.svelte';
    import { scale } from 'svelte/transition';
    import { t } from '$lib/i18n';

    // Status label mapping function
    function getStatusLabel(state: DocumentState | TaskState): string {
        const stateStr = state as string;
        const key = `app.import.doc-status-${stateStr.toLowerCase()}`;
        return $t(key);
    }

    interface Props {
        doc: Document | Task;
        removable?: boolean;
        onclick?: (doc: Document | Task) => void;
        onremove?: (doc: Document | Task) => void;
    }

    let { doc, removable = true, onclick, onremove }: Props = $props();
    // Commented out to avoid Svelte proxy warnings - use $state.snapshot() if debugging needed
    // console.log('ImportDocument:', $state.snapshot(doc));
</script>

<div class="report {doc.state}" onclick={() => onclick?.(doc)} transition:scale role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick?.(doc); } }} aria-label={$t('aria.import.open-document', { values: { title: doc.title } })}>
    
    <div class="preview">
        {#if doc.pages?.[0]?.thumbnail}
            {#if doc.pages[0]?.thumbnail}
                <img src={doc.pages[0].thumbnail} loading="lazy" alt={doc.title} class="thumbmail" />
            {/if}
        {:else if doc.thumbnail}
            <img src={doc.thumbnail} loading="lazy" alt={doc.title} class="thumbmail" />
        {:else if doc.icon}
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <use href="/files.svg#{doc.icon}" />
            </svg>
        {/if}
        <ScanningAnimation running={doc.state === DocumentState.PROCESSING || doc.state == TaskState.ASSESSING} />
    </div>
    <div class="title">{doc.title}</div>

    {#if removable && !(doc.state === DocumentState.PROCESSING || doc.state == TaskState.ASSESSING)}
        <button class="remove" aria-label={$t('aria.import.remove-file')} onclick={stopPropagation(() => onremove?.(doc))}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <use href="/icons.svg#close" />
            </svg>
        </button>
    {/if}
    {#if doc.state != DocumentState.PROCESSED}
        <div class="status">
            {getStatusLabel(doc.state)}
        </div>
    {/if}
</div>


<style>
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
    .report.NEW {
        --color: var(--color-gray-300);
        --color-text: var(--color-text);
    }
    .report.ASSESSING {
        --color: var(--color-purple);
        --color-text: var(--color-white);
        border-color: var(--color);
    }
    .report.PROCESSING {
        --color: var(--color-blue);
        --color-text: var(--color-white);
        border-color: var(--color);   
    }
    .report.PROCESSED {
        --color: var(--color-positive);
        --color-text: var(--color-white);
        border-color: var(--color);
    }
    .report.ERROR {
        --color: var(--color-negative);
        --color-text: var(--color-white);
        border-color: var(--color);
    }
    .report.ERROR::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: var(--color-negative);
        opacity: .3;
    }
    .report .status {
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        bottom: -2.5rem;
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
        font-size: 1rem;
        font-weight: bold;
        z-index: 10;
        border-radius: var(--radius-8);
        background-color: var(--color);
        color: var(--color-text);
        padding: .5rem;
    }

    .report.ERROR .status {

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
    .thumbmail {
        max-width: 6rem;
        max-height: 6rem;
        object-fit: contain;
        border: 1px solid var(--color-gray-500);
        box-shadow: 0 .4rem .5rem -.3rem rgba(0, 0, 0, 0.3);

    }

    .report .remove {
        position: absolute;
        top: -.2rem;
        right: -.2rem;
        padding: .4rem;
        background-color: transparent;
        fill: currentColor;
        border: none;
        border-top-right-radius: var(--radius) ;
        border-bottom-left-radius: var(--radius) ;
        cursor: pointer;
    }
    .report .remove:hover {
        background-color: var(--color-negative);
        color: var(--color-negative-text);
    }

    .report .remove svg {
        fill: currentColor;
        width: 1.2rem;
        height: 1.2rem;
    }
</style>