<script lang="ts">
    import { type Document } from '$lib/documents/types.d';
    import { removeDocument } from '$lib/documents';
    import { goto } from '$app/navigation';
    import { t } from '$lib/i18n';

    interface Props {
        document: Document;
    }

    let { document }: Props = $props();

    async function remove() {
        console.log('remove document', document);
        if (confirm($t('app.documents.confirm-remove'))) {
            await removeDocument(document.id);
            goto('/med/p/' + document.user_id + '/documents');
        }
    }

    function bookmark() {
        console.log('bookmark document', document);
        // TODO: Implement bookmark functionality
    }
</script>

<div class="toolbar">
    <button  onclick={bookmark} aria-label={$t('app.documents.bookmark')}>
        <svg><use href="/icons.svg#star" /></svg>
    </button>
    <button class="-danger" onclick={remove} aria-label={$t('app.documents.remove')}>
        <svg><use href="/icons.svg#close" /></svg>
    </button>
</div>

<style>
    .toolbar {
        /*height: var(--heading-height);
        margin-bottom: var(--gap);*/
    }

    .toolbar button {
        color: var(--color-text-secondary);
    }

    .toolbar button:hover {
        background: var(--color-interactivity);
        color: var(--color-interactivity-text);
    }
    .toolbar button.-danger:hover {
        background: var(--color-negative);
        color: var(--color-negative-text);
    }
</style>