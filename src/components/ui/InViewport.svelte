<script lang="ts">
    import type { ComponentType } from 'svelte';

    interface Props {
        isIntersecting?: boolean;
        clearOnExit?: boolean;
        component?: ComponentType;
        componentProps?: any;
        onenter?: () => void;
        onexit?: () => void;
        children?: import('svelte').Snippet;
    }

    let {
        isIntersecting = $bindable(false),
        clearOnExit = false,
        component = undefined,
        componentProps = {},
        onenter = undefined,
        onexit = undefined,
        children
    }: Props = $props();

    let intersectionObserver : IntersectionObserver | null = null;

    function ensureIntersectionObserver() {
        if (intersectionObserver) return;

    intersectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        enter();
                    } else {
                        exit();
                    }
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
        onenter?.();
    }
    function exit() {
        if (clearOnExit) isIntersecting = false;
        onexit?.();
    }

</script>

<div use:viewport>
    {#if isIntersecting}
        {#if component}
            {@const DynComp = component}
            <DynComp {...componentProps} />
        {:else}
            {@render children?.()}
        {/if}
    {/if}
</div>