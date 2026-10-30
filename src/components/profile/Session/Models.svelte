<script lang="ts">
    import LoaderThinking from "$components/ui/LoaderThinking.svelte";

    type Model = {
        name: string;
        active: boolean;
        available: boolean;
        disabled: boolean;
    }

    const uid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    interface Props {
        models?: Model[];
        activeModels?: string[];
    }

    let { models = [], activeModels = [] }: Props = $props();
    
</script>


<div class="models">
    {#each models as model}
    <label class="model" 
        class:-active={model.active} 
        class:-disabled={model.disabled}
        class:-available={model.available}
        for="model-uid-{model.name}">
        <svg>
            <use href="/icons-o.svg#model-{model.name.toLowerCase()}"></use>
        </svg>
        <div class="name">
            {model.name}
        </div>
        {#if activeModels.includes(model.name)}
        <div class="loader">
            <LoaderThinking />
        </div>
        {/if}
        {#if model.disabled}
            <span class="overlay">Coming soon</span>
        {/if}
    </label>
    <input type="checkbox" id="model-uid-{model.name}" bind:checked={model.active} hidden />
    {/each}
</div>


<style>
    .models {
        display: flex;
        gap: var(--gap);
        height: 6.4rem;
        margin-top: var(--gap);
        align-items: stretch;
        justify-content: stretch;
        width: 100%;
        overflow: auto;
    }

    .model {
        position: relative;
        padding: 1.6rem;
        font-weight: var(--text-bold);
        box-shadow: inset 0 0 1.6rem 0 var(--color-gray-800);
        min-width: 24rem;
        display: flex;
        align-items: center;
        transition: background-color .5s, box-shadow .5s;

    }

    .model.-active {
        background-color: var(--color-gray-300);
        box-shadow: inset 0 0 0 0 var(--color-gray-800);
    }
    .model.-disabled {
        color: var(--color-white);
        opacity: .3;
    }
    .model svg {
        width: 2.4rem;
        height: 2.4rem;
        fill: currentColor;
        margin-right: 0.8rem;
    }
    .model .overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-black);
        font-size: 2.4rem;
        font-weight: var(--text-bold);
    }
    .model .name {
        flex-grow: 1;
    }
    .model .loader {
        --color: var(--color-neutral);
        height: 2.4rem;
    }
</style>