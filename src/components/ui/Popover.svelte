<script lang="ts">
    interface Props {
        open?: boolean;
        placement?: 'top' | 'bottom';
        onclose?: () => void;
        trigger?: import('svelte').Snippet;
        children?: import('svelte').Snippet;
    }

    let {
        open = $bindable(false),
        placement = 'top',
        onclose,
        trigger,
        children
    }: Props = $props();

    let wrapperEl: HTMLElement;
    let popoverStyle = $state('');

    $effect(() => {
        if (open && wrapperEl) {
            const rect = wrapperEl.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            if (placement === 'top') {
                const bottom = window.innerHeight - rect.top + 10;
                popoverStyle = `bottom:${bottom}px;left:${centerX}px`;
            } else {
                const top = rect.bottom + 10;
                popoverStyle = `top:${top}px;left:${centerX}px`;
            }
        }
    });

    function handleClickOutside(e: MouseEvent) {
        if (open && wrapperEl && !wrapperEl.contains(e.target as Node)) {
            open = false;
            onclose?.();
        }
    }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="popover-wrapper" bind:this={wrapperEl}>
    {@render trigger?.()}
    {#if open}
        <div
            class="popover"
            class:-top={placement === 'top'}
            class:-bottom={placement === 'bottom'}
            role="menu"
            style={popoverStyle}
        >
            {@render children?.()}
        </div>
    {/if}
</div>

<style>
    .popover-wrapper {
        position: relative;
    }

    .popover {
        position: fixed;
        transform: translateX(-50%);
        background: rgba(var(--color-background-rgb, 255, 255, 255), 0.95);
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-medium);
        backdrop-filter: blur(4px);
        box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.3rem;
        z-index: 1000;
        min-width: 13rem;
    }

    /* Arrow — two pseudo-elements for border + fill */
    .popover::before,
    .popover::after {
        content: '';
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        border: 9px solid transparent;
        pointer-events: none;
    }

    /* Arrow pointing DOWN (menu is above trigger) */
    .popover.-top::before {
        top: 100%;
        border-top-color: var(--color-border);
    }

    .popover.-top::after {
        top: 100%;
        margin-top: -2px;
        border: 8px solid transparent;
        border-top-color: rgba(var(--color-background-rgb, 255, 255, 255), 0.95);
    }

    /* Arrow pointing UP (menu is below trigger) */
    .popover.-bottom::before {
        bottom: 100%;
        border-bottom-color: var(--color-border);
    }

    .popover.-bottom::after {
        bottom: 100%;
        margin-bottom: -2px;
        border: 8px solid transparent;
        border-bottom-color: rgba(var(--color-background-rgb, 255, 255, 255), 0.95);
    }
</style>
