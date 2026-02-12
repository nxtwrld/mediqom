<script lang="ts">
    import type { ComponentType } from 'svelte';

    interface Props {
        isIntersecting?: boolean;
        clearOnExit?: boolean;
        component?: ComponentType;
        componentProps?: any;
    }

    let {
        isIntersecting = $bindable(false),
        clearOnExit = false,
        component = undefined,
        componentProps = {}
    }: Props = $props();

    let intersectionObserver : IntersectionObserver | null = null;

    function ensureIntersectionObserver() {
        if (intersectionObserver) return;

    intersectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    const eventName = entry.isIntersecting ? 'enterViewport' : 'exitViewport';
                    entry.target.dispatchEvent(new CustomEvent(eventName));
                });
            }
        );
    }

    function viewport(element: HTMLElement) {
        ensureIntersectionObserver();

        if (intersectionObserver) {
            intersectionObserver.observe(element);
        }

        return {
            destroy() {
                if (intersectionObserver) {
                    intersectionObserver.unobserve(element);
                    //intersectionObserver.disconnect();
                }
                intersectionObserver = null;
            }
        }
    }


    function enter() {
        isIntersecting = true;
    }
    function exit() {
        if (clearOnExit) isIntersecting = false;
    }

</script>

<div use:viewport onenterViewport={enter} onexitViewport={exit}>
    {#if isIntersecting}
        {#if component}
            <svelte:component this={component} {...componentProps} />
        {:else}
            <slot />
        {/if}
    {/if}
</div>