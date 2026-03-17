
<script lang="ts">
    import { getByAnotherAuthor } from '$lib/documents/tools';
    import type { Document } from '$lib/documents/types.d';
    import BadgeHorizontal from '$components/ui/dates/BadgeHorizontal.svelte';
    import { profile } from '$lib/profiles';
    import { t } from '$lib/i18n';

    interface Props {
        document: Document;
        shareCount?: number;
    }

    let { document, shareCount = 0 }: Props = $props();

    let author = $derived(getByAnotherAuthor(document))
    let thumbnail = $derived(document.thumbnail as string | undefined)
</script>


<a href="/med/p/{document.user_id}/documents/{document.id}" class="tile -document category-{document.metadata.category}" class:-has-thumbnail={thumbnail}>
    {#if thumbnail}
        <div class="tile-thumbnail" style:background-image="url({thumbnail})"></div>
    {/if}

    <div class="tile-header"> <BadgeHorizontal date={document.metadata.date} /> </div>
    <div class="tile-body">
        <h4 class="h4">{document.metadata.title}</h4>
    </div>

    <div class="tile-footer  category-{document.metadata.category}">


        <svg class="category">
            <use href="/icons-o.svg#report-{document.metadata.category}" />
        </svg>

        <div class="people">
            {#if author}
                {author.fullName}
            {:else if $profile}
                {$profile.fullName}
            {/if}
        </div>
        {#if shareCount > 0}
            <a
                href="/med/p/{document.user_id}/shares"
                class="share-badge"
                onclick={(e) => e.stopPropagation()}
                aria-label={$t('share.shared-count', { values: { count: shareCount } })}
            >
                <svg><use href="/icons.svg#share" /></svg>
                <span>{shareCount}</span>
            </a>
        {/if}
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
        overflow: hidden;
    }

    .tile-thumbnail {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
        z-index: 0;
    }

    .tile.-has-thumbnail .tile-header,
    .tile.-has-thumbnail .tile-body,
    .tile.-has-thumbnail .tile-footer {
        position: relative;
        z-index: 1;
    }

    .tile.-has-thumbnail .tile-body {
        background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%);
        color: var(--color-white);
    }

    .tile.-has-thumbnail .tile-header {
        background: linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 100%);
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
        background-color: var(--color);
        color: var(--color-text);
    }

    .tile:hover {
        background-color: var(--color-white);
    }

    .tile:hover .tile-footer {
        background-color: var(--color);
        color: var(--color-text);
    }

    .tile  svg.category {
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

    .share-badge {
        display: flex;
        align-items: center;
        gap: 0.2rem;
        margin: 0.3rem 0.5rem;
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        text-decoration: none;
    }

    .share-badge svg {
        width: 0.9rem;
        height: 0.9rem;
        fill: currentColor;
    }

    .share-badge:hover {
        color: var(--color-text-primary);
    }

</style>