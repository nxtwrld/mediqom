
<script lang="ts">
    import { getByAnotherAuthor } from '$lib/documents/tools';
    import type { Document } from '$lib/documents/types.d';
    import BadgeHorizontal from '$components/ui/dates/BadgeHorizontal.svelte';
    import { profile } from '$lib/profiles';

    interface Props {
        document: Document;
    }

    let { document }: Props = $props();

    let author = $derived(getByAnotherAuthor(document))
</script>


<a href="/med/p/{document.user_id}/documents/{document.id}" class="tile -vertical category-{document.metadata.category}">
    <!--Vertical date={document.metadata.date} /-->

    <div class="tile-header"> <BadgeHorizontal date={document.metadata.date} /> </div>
    <div class="tile-body">
        <h4 class="h4">{document.metadata.title}</h4>
    </div>

    <div class="tile-footer">


        <svg class="category">
            <use href="/icons-o.svg#report-{document.metadata.category}" />
        </svg>

        <div class="people">
            {#if author}
                {author.fullName}
            {:else}
                {$profile.fullName}
            {/if}
        </div>
    </div>
    <!--div class="actions"></div-->
</a>


<style>
    .tile {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: space-between;

    }
    .tile .tile-body {
        flex-grow: 1;
        padding: .5rem;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
    }
    .tile .tile-body .h4 {
        font-family: var(--font-face-heading);
    }
    .tile .tile-header {
        display: flex;
        justify-content: flex-end;
        font-size: 1rem;
        padding: .5rem;
    }
    .tile .tile-footer {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background-color: var(--color-gray-600);
    }

    .tile:hover {
        background-color: var(--color-white);
    }

    .tile:hover .tile-footer {
        background-color: var(--color);
        color: var(--color-text);
    }

    .tile  svg.category {
        color: var(--color);
        margin: .5rem;
        width: 1.6rem;
        height: 1.6rem;
        fill: currentColor;
    }
    .tile:hover  svg.category {
        color: var(--color-text);
    }

    .tile .people {
        margin: .5rem;
    }

</style>