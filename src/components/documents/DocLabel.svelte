<script module>
    import { writable } from 'svelte/store';
    const activePopup = writable<symbol | null>(null);
</script>

<script lang="ts">
    type DocItem = {
        id: string;
        user_id: string;
        metadata?: Record<string, any>;
        created_at?: string;
    };

    interface Props {
        /** One or more documents to represent. Multiple docs are shown as a group. */
        docs: DocItem[];
    }

    let { docs }: Props = $props();

    let popupOpen = $state(false);
    const instanceId = Symbol();

    // Close self when another instance opens
    $effect(() => {
        return activePopup.subscribe(active => {
            if (active !== instanceId && popupOpen) {
                popupOpen = false;
            }
        });
    });

    // Close on outside click
    $effect(() => {
        if (!popupOpen) return;
        function handler() {
            popupOpen = false;
            activePopup.set(null);
        }
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    });

    function getCategory(doc: DocItem): string {
        return (doc.metadata as any)?.category ?? 'other';
    }

    function getTitle(doc: DocItem): string {
        return (doc.metadata as any)?.title ?? '';
    }

    function handleClick(e: MouseEvent) {
        e.stopPropagation();
        const next = !popupOpen;
        popupOpen = next;
        activePopup.set(next ? instanceId : null);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const next = !popupOpen;
            popupOpen = next;
            activePopup.set(next ? instanceId : null);
        }
    }

    const isGroup = $derived(docs.length > 1);
    const primary = $derived(docs[0]);
    const primaryCat = $derived(getCategory(primary));
    const visibleDocs = $derived(docs.slice(0, 3));
</script>

<div class="doc-label" class:-group={isGroup}>
    <div
        class="highlight {isGroup ? '' : 'category-' + primaryCat}"
        onclick={handleClick}
        onkeydown={handleKeydown}
        role="button"
        tabindex="0"
        aria-label={isGroup ? `${docs.length} documents` : primaryCat}
    >
        {#if isGroup}
            <div class="icon-stack">
                {#each visibleDocs as doc, i}
                    <div class="icon category-{getCategory(doc)}" style="--si: {i}">
                        {#if i === 0}
                            <svg><use href="/icons-o.svg#report-{getCategory(doc)}" /></svg>
                        {/if}
                    </div>
                {/each}
            </div>
        {:else}
            <div class="icon">
                <svg><use href="/icons-o.svg#report-{primaryCat}" /></svg>
            </div>
        {/if}
    </div>

    {#if docs.length > 1}
    <span class="badge">{docs.length}</span>
    {/if}

    {#if popupOpen}
        <div class="doc-popup" role="menu">
            {#each docs as doc}
                <a
                    class="doc-popup-action"
                    href="/med/p/{doc.user_id}/documents/{doc.id}"
                >
                    <span class="cat-dot category-{getCategory(doc)}"></span>
                    <span>{getTitle(doc) || getCategory(doc)}</span>
                </a>
            {/each}
        </div>
    {/if}
</div>

<style>
    .doc-label {
        position: relative;
        display: block;
    }

    /* ── Round frosted-glass button (matches anatomy Body.svelte label style) ── */

    .highlight {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 1.25rem;
        border: 1px solid rgba(255, 255, 255, 0.55);
        backdrop-filter: blur(0.8rem);
        -webkit-backdrop-filter: blur(0.8rem);
        background: rgba(255, 255, 255, 0.15);
        padding: 0.35rem;
        box-shadow:
            0 0 0 0.1rem rgba(255, 255, 255, 0.35),
            0.2rem 0.2rem 0.4rem rgba(0, 0, 0, 0.3);
        cursor: pointer;
        transition: all 0.2s ease-in-out;
        outline: none;
        user-select: none;
    }

    /* ── Icon stack for grouped docs ── */

    .icon-stack {
        position: relative;
        width: 100%;
        aspect-ratio: 1;
    }

    .doc-label.-group .highlight{
        height: 3rem;
    }
    .doc-label.-group .highlight > * {
        transform: translateY(-.2rem);
    }

    @media (hover: hover) {
        .highlight:hover {
            width: 2.8rem;
            height: 2.8rem;
            border-radius: 1.4rem;
            padding: 0.3rem;
        }
        .doc-label.-group .highlight:hover {
            height: 3.4rem;
        }
        .doc-label.-group .highlight:hover > * {
            transform: translateY(-.2rem);
        }
    }

    .-group .icon-stack .icon {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        aspect-ratio: 1;
        transform: translateY(calc(var(--si, 0) * 0.2rem));
        z-index: calc(3 - var(--si, 0));
        opacity: calc(1 - var(--si, 0) * 0.15);
    }

    /* ── Colored category icon circle (uses --color from categories.css) ── */

    .icon {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: var(--color, #546e7a);
        color: var(--color-text, #fff);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease-in-out;
        border: 1px solid rgba(255, 255, 255, 0.4);
        position: relative;
        overflow: hidden;
    }

    .icon svg {
        width: 62%;
        height: 62%;
        fill: currentColor;
        display: block;
        flex-shrink: 0;
        opacity: 1;
        transition: opacity 0.2s ease-in-out;
    }

    /* Popup menu */
    .doc-popup {
        position: absolute;
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
        z-index: 11;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: 0.3rem;
        min-width: 9rem;
        max-width: 15rem;
        background: rgba(var(--color-background-rgb, 255, 255, 255), 0.95);
        color: var(--color-text-primary);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border-radius: var(--ui-radius-medium);
        border: 1px solid var(--color-border);
        box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.2);
        pointer-events: all;
    }

    .doc-popup::before,
    .doc-popup::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 100%;
        transform: translateY(-50%);
        border: 9px solid transparent;
        pointer-events: none;
    }

    .doc-popup::before {
        border-left-color: var(--color-border);
    }

    .doc-popup::after {
        margin-left: -2px;
        border: 8px solid transparent;
        border-left-color: rgba(var(--color-background-rgb, 255, 255, 255), 0.95);
    }

    .doc-popup-action {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        color: var(--color-text-primary);
        padding: 0.22rem 0.35rem;
        border-radius: var(--ui-radius-small);
        border: none;
        text-decoration: none;
        font-size: 0.72rem;
        overflow: hidden;
        transition: background 0.15s;
        white-space: nowrap;
    }

    @media (hover: hover) {
        .doc-popup-action:hover {
            background: var(--color-surface);
        }
    }

    .cat-dot {
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        background-color: var(--color, #546e7a);
        flex-shrink: 0;
        display: inline-block;
    }

    /* Count badge for groups */
    .badge {
        position: absolute;
        top: 0;
        right: -0.2rem;
        min-width: 0.85rem;
        height: 0.85rem;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.5);
        color: #fff;
        font-size: 0.48rem;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 0.1rem;
        line-height: 1;
        pointer-events: none;
        z-index: 2;
    }
</style>
