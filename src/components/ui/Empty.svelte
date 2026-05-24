<script lang="ts">
    import { t } from '$lib/i18n';

    interface Props {
        class?: string;
        children?: import('svelte').Snippet;
    }

    let { class: className = '', children }: Props = $props();
    
</script>

<div class="empty {className}">
    {#if children}
        {@render children?.()}
    {:else}
    { $t('links.no-items') }
    {/if}
</div>


<style>
    .empty {
        display: flex;
        flex-grow: 1;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--color-text-light);
        letter-spacing: .05rem;
        overflow: hidden;
        width: 100%;
        height: 100%;
        padding: .5rem 1rem;
        transition: letter-spacing .2s ease-in-out;

    }
</style>