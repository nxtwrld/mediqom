<script lang="ts">
    import { run } from 'svelte/legacy';

    import type { Document } from "$lib/documents/types.d";

    interface Props {
        doc: Document;
    }

    let { doc }: Props = $props();

    let thumbnail = $derived(doc.content?.attachments.find((a: any) => {
        return a.thumbnail;
    }).thumbnail);

    run(() => {
        console.log('0', doc.content.attachments);
        console.log('1',thumbnail);
    });
</script>

    <div class="report">
        <div class="preview">
            {#if thumbnail}
            <img src={thumbnail} loading="lazy" alt={doc.metadata.title} class="thumbmail" />
            {/if}
        </div>
        <div class="title">{doc.metadata.title}</div>
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
</style>