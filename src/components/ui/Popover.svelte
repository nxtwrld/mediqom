<script lang="ts">
    import { tick } from 'svelte';

    interface Props {
        open?: boolean;
        placement?: 'top' | 'bottom';
        onclose?: () => void;
        trigger?: import('svelte').Snippet;
        children?: import('svelte').Snippet;
        // Absolute positioning mode (for use inside positioned containers like charts)
        x?: number;
        y?: number;
        arrowOffset?: number;
    }

    let {
        open = $bindable(false),
        placement = 'top',
        onclose,
        trigger,
        children,
        x,
        y,
        arrowOffset,
    }: Props = $props();

    const isAbsolute = $derived(x !== undefined && y !== undefined);
    const MARGIN = 10;

    let wrapperEl = $state<HTMLElement | undefined>(undefined);
    let popoverEl = $state<HTMLElement | undefined>(undefined);
    let popoverStyle = $state('');
    let arrowStyle = $state('');
    let absoluteStyle = $state('');

    $effect(() => {
        if (open && !isAbsolute && wrapperEl) {
            positionPopover();
        }
    });

    $effect(() => {
        if (open && isAbsolute && x !== undefined && y !== undefined) {
            positionAbsolutePopover();
        }
    });

    async function positionAbsolutePopover() {
        // Set initial position so the popover renders and we can measure it
        absoluteStyle = `left:${x}px;top:${y}px;--arrow-offset:${arrowOffset ?? 0}px`;
        await tick();
        if (!popoverEl) return;

        const popRect = popoverEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let adjustX = 0;
        let adjustY = 0;

        // Horizontal clamping
        if (popRect.left < MARGIN) {
            adjustX = MARGIN - popRect.left;
        } else if (popRect.right > vw - MARGIN) {
            adjustX = (vw - MARGIN) - popRect.right;
        }

        // Vertical clamping
        if (popRect.top < MARGIN) {
            adjustY = MARGIN - popRect.top;
        } else if (popRect.bottom > vh - MARGIN) {
            adjustY = (vh - MARGIN) - popRect.bottom;
        }

        if (adjustX !== 0 || adjustY !== 0) {
            // Arrow offset correction: popover shifted, so arrow must shift back to point at trigger
            const correctedArrowOffset = (arrowOffset ?? 0) - adjustX;
            absoluteStyle = `left:${(x ?? 0) + adjustX}px;top:${(y ?? 0) + adjustY}px;--arrow-offset:${correctedArrowOffset}px`;
        }
    }

    async function positionPopover() {
        const rect = wrapperEl!.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Set initial position so the popover renders and we can measure it
        if (placement === 'top') {
            const bottom = vh - rect.top + 10;
            popoverStyle = `bottom:${bottom}px;left:${centerX}px`;
        } else {
            const top = rect.bottom + 10;
            popoverStyle = `top:${top}px;left:${centerX}px`;
        }
        arrowStyle = '';

        // Wait for render to measure popover dimensions
        await tick();
        if (!popoverEl) return;

        const popRect = popoverEl.getBoundingClientRect();
        let finalPlacement = placement;

        // Vertical flip: if popover overflows in the current direction, try the other
        if (placement === 'bottom' && popRect.bottom > vh - MARGIN) {
            const topBottom = vh - rect.top + 10;
            if (rect.top - 10 - popRect.height > MARGIN) {
                finalPlacement = 'top';
                popoverStyle = `bottom:${topBottom}px;left:${centerX}px`;
                await tick();
            }
        } else if (placement === 'top' && popRect.top < MARGIN) {
            const bottomTop = rect.bottom + 10;
            if (rect.bottom + 10 + popRect.height < vh - MARGIN) {
                finalPlacement = 'bottom';
                popoverStyle = `top:${bottomTop}px;left:${centerX}px`;
                await tick();
            }
        }

        // Re-measure after potential flip
        if (!popoverEl) return;
        const finalRect = popoverEl.getBoundingClientRect();

        // Horizontal clamping
        const clampedLeft = Math.max(MARGIN, Math.min(centerX - finalRect.width / 2, vw - finalRect.width - MARGIN));

        // Arrow offset: how far the arrow needs to shift from center to still point at trigger
        const popoverCenter = clampedLeft + finalRect.width / 2;
        const arrowShift = centerX - popoverCenter;
        arrowStyle = `--arrow-shift:${arrowShift}px`;

        if (finalPlacement === 'top') {
            const bottom = vh - rect.top + 10;
            popoverStyle = `bottom:${bottom}px;left:${clampedLeft}px`;
        } else {
            const top = rect.bottom + 10;
            popoverStyle = `top:${top}px;left:${clampedLeft}px`;
        }

        // Update placement class if flipped
        if (finalPlacement !== placement) {
            popoverEl.classList.remove(`-${placement}`);
            popoverEl.classList.add(`-${finalPlacement}`);
        }
    }

    function handleClickOutside(e: MouseEvent) {
        if (!open) return;
        if (isAbsolute) {
            if (popoverEl && !popoverEl.contains(e.target as Node)) {
                onclose?.();
            }
        } else if (wrapperEl && !wrapperEl.contains(e.target as Node)) {
            open = false;
            onclose?.();
        }
    }
</script>

<svelte:window onclick={handleClickOutside} />

{#if isAbsolute}
    {#if open}
        <div
            bind:this={popoverEl}
            class="popover -absolute"
            class:-top={placement === 'top'}
            class:-bottom={placement === 'bottom'}
            style={absoluteStyle}
            role="menu"
        >
            <div class="popover-inner">
                {@render children?.()}
            </div>
        </div>
    {/if}
{:else}
    <div class="popover-wrapper" bind:this={wrapperEl}>
        {@render trigger?.()}
        {#if open}
            <div
                bind:this={popoverEl}
                class="popover -fixed"
                class:-top={placement === 'top'}
                class:-bottom={placement === 'bottom'}
                role="menu"
                style="{popoverStyle};{arrowStyle}"
            >
                <div class="popover-inner">
                    {@render children?.()}
                </div>
            </div>
        {/if}
    </div>
{/if}

<style>
    .popover-wrapper {
        position: relative;
    }

    .popover {
        background: rgba(var(--color-background-rgb, 255, 255, 255), 0.95);
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-medium);
        backdrop-filter: blur(4px);
        box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.2);
        padding: 0.3rem;
        z-index: 1000;
        min-width: 13rem;
        overflow: visible;
    }

    .popover-inner {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        max-height: calc(100vh - 2rem);
        overflow-y: auto;
    }

    /* Fixed positioning mode (trigger-based) */
    .popover.-fixed {
        position: fixed;
    }

    /* Absolute positioning mode (chart/container-based) */
    .popover.-absolute {
        position: absolute;
    }

    .popover.-absolute.-top {
        transform: translate(-50%, calc(-100% - 20px));
    }

    .popover.-absolute.-bottom {
        transform: translate(-50%, 20px);
    }

    /* Arrow — two pseudo-elements for border + fill */
    .popover::before,
    .popover::after {
        content: '';
        position: absolute;
        transform: translateX(-50%);
        border: 9px solid transparent;
        pointer-events: none;
    }

    /* Fixed mode arrow — centered + shifted when clamped */
    .popover.-fixed::before,
    .popover.-fixed::after {
        left: calc(50% + var(--arrow-shift, 0px));
    }

    /* Absolute mode arrow — offset by --arrow-offset */
    .popover.-absolute::before,
    .popover.-absolute::after {
        left: calc(50% + var(--arrow-offset, 0px));
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
