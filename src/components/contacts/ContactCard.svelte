<script lang="ts">
    import type { Snippet } from 'svelte';
    import ProfileImage from '$components/profile/ProfileImage.svelte';

    interface Props {
        name: string;
        role?: string;
        specialty?: string;
        expanded?: boolean;
        ontoggle?: () => void;
        headerExtras?: Snippet;
        children?: Snippet;
        image?: Snippet;
    }

    let { name, role, specialty, expanded = false, ontoggle, headerExtras, children, image }: Props = $props();

    function formatRole(raw: string): string {
        const str = Array.isArray(raw) ? (raw as string[]).join(', ') : String(raw);
        return str.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    }
</script>

<div class="contact-card card" class:expanded>
    <button class="card-header" onclick={ontoggle} type="button" aria-expanded={expanded}>
        <p class="name">{name}</p>
        {#if role}
            <p class="role">{formatRole(role)}</p>
        {/if}
        {#if specialty}
            <p class="specialty">{specialty}</p>
        {/if}
        {#if headerExtras}
            {@render headerExtras()}
        {/if}
        <span class="expand-toggle" aria-hidden="true">
            <svg class="chevron"><use href="/icons.svg#chevron-down" /></svg>
        </span>
    </button>
    {#if expanded && children}
        <div class="card-body">
            {#if image}
                <div class="image">
                    {@render image()}
                </div>
            {:else}
                <div class="image">
                    <ProfileImage size={6} />
                </div>
            {/if}
            {@render children()}
        </div>
    {/if}
</div>

<style>
    .card {
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--gap);
        padding: var(--ui-pad-medium);
        background-color: var(--color-background);
        cursor: pointer;
        user-select: none;
        width: 100%;
        border: 1px solid var(--color-border);
        text-align: left;
        font: inherit;
        transition: background-color 0.2s ease;
    }

    .card-header:hover {
        background-color: var(--color-gray-300);
    }

    .card-header .name {
        font-weight: bold;
        font-size: 1.1rem;
        margin: 0;
    }

    .card-header .role {
        color: var(--color-text-secondary);
        font-size: 0.85rem;
        margin: 0;
    }

    .card-header .specialty {
        color: var(--color-text-secondary);
        font-size: 0.8rem;
        margin: 0;
    }

    .expand-toggle {
        flex-shrink: 0;
        width: 1.5rem;
        height: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary);
    }

    .expand-toggle .chevron {
        width: 100%;
        height: 100%;
        fill: currentColor;
        transition: transform 0.2s ease;
    }

    .card.expanded .expand-toggle .chevron {
        transform: rotate(180deg);
    }

    .card-body {
        display: flex;
        align-items: stretch;
        gap: var(--gap);
        border: 1px solid var(--color-border);
        border-top: none;
    }

    .card .image {
        background-color: var(--color-background);
        padding: var(--ui-pad-medium);
        flex-shrink: 0;
        max-width: min(5rem, 20vw);
    }

    @media (max-width: 768px) {
        .card-body {
            flex-direction: column;
        }

        .card .image {
            display: none;
        }
    }
</style>
