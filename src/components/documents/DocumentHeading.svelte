<script lang="ts">
    import { type Document } from '$lib/documents/types.d';
    import BadgeHorizontal from '$components/ui/dates/BadgeHorizontal.svelte';
    import DocumentToolbar from './DocumentToolbar.svelte';
    interface Props {
        document: Document;
    }

    let { document }: Props = $props();
</script>

<div class="heading -heading-main -sticky category-{document.metadata.category}">
    <div class="heading-icon">
        <svg class="-icon">
            <use href="/icons-o.svg#report-{document.metadata.category}" />
        </svg>
    </div>
    <h1 class="h1">
        <div class="-date"><BadgeHorizontal date={document.metadata.date} /></div>
        {document.metadata.title}</h1>

    <DocumentToolbar {document} />        
</div>

<style>

</style>
