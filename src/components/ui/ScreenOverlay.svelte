<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { t } from "svelte-i18n";
    import Modal from "./Modal.svelte";
    import { fade } from "svelte/transition";

    const dispatch = createEventDispatcher();

    interface Props {
        title?: string | undefined;
        preventer?: boolean;
        heading?: import('svelte').Snippet;
        children?: import('svelte').Snippet;
    }

    let {
        title = undefined,
        preventer = false,
        heading,
        children
    }: Props = $props();

    let showPreviewDisabled = $state(false);
</script>




<div class="overlay" transition:fade>
    <div class="screen-preview">


        {#if heading}
            {@render heading?.()}
        {:else}
            <div class="heading">
                <h3 class="h3 heading">{title}</h3>
                <div class="actions">
                    <button class="-close" aria-label={$t('aria.ui.close-overlay')} onclick={() => dispatch('close')}>
                        <svg>
                            <use href="/icons.svg#close" />
                        </svg>
                    </button>
                </div>
            </div>
        {/if}

        <div class="page -empty">
            <div class="preview-container">
                {@render children?.()}

                {#if preventer}
                <button onclick={() => showPreviewDisabled = true} class="preview-preventer" aria-label={$t('app.import.preview-disabled')}>
                </button>
                {/if}
            </div>
        </div>
    </div>
</div>

{#if showPreviewDisabled}
<Modal onclose={() => { showPreviewDisabled = false; }}>
    <p class="p preview-disabled-message">{ $t('app.import.preview-disabled') }</p>
</Modal>
{/if}

<style>
.screen-preview {
    margin-left: 20vw;
}

.screen-preview > .page {
    height: calc(100vh - var(--heading-height));
}
.screen-preview .preview-container {
    position: relative;
    width: 100%;
    min-height: 100%;
    overflow: hidden;
}
.screen-preview .preview-preventer {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    z-index: 11;
    cursor: not-allowed;

}

</style>