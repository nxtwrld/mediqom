<script lang="ts">
    import Autocomplete from 'simple-svelte-autocomplete';
    import { createEventDispatcher } from 'svelte';
    import type { SelectOptions } from './Select.svelte';

    const dispatch = createEventDispatcher();

    interface Props {
        value: string;
        label?: string | undefined;
        placeholder?: string;
        options?: SelectOptions;
        required?: boolean;
        bindValue?: boolean;
        id?: string;
        name?: string;
        class?: string;
        children?: import('svelte').Snippet;
    }

    let {
        value = $bindable(),
        label = undefined,
        placeholder = 'Select',
        options = [],
        required = false,
        bindValue = false,
        id = (window as any)?.crypto.getRandomValues(new Uint32Array(1))[0].toString(16),
        name = id,
        class: className = 'input',
        children
    }: Props = $props();
    

</script>

{#if children || label}
<label class="label" for={id}>
    {#if label}
        {label}
    {:else}
        {@render children?.()}
    {/if}
</label>
{/if}
<span>


    <Autocomplete inputId={id} {name} valueFieldName="key" labelFieldName="value" {className}  items={options} 
        bind:value={value}  {placeholder} {required} noResultsText="Custom" noInputStyles={true}
        onBlur={() => dispatch('blur')} onChange={() => dispatch('change')} onFocus={() => dispatch('focus')} 
    >
        <!-- @migration-task: migrate this slot by hand, `no-results` is an invalid identifier -->
    <span slot="no-results">No results</span>
        {#snippet loading()}
                <span >Loading</span>
            {/snippet}

    </Autocomplete>

</span>

<style>

    span :global(.autocomplete) {
        width: 100%;
    }
    span :global(.autocomplete:after) {
        border-color: inherit !important;
    }
    span :global(.autocomplete.input) {
        padding: 0 !important;
        font-size: 1.8rem !important;
    }
    span :global(.autocomplete input) {
        width: 100% !important;
        margin: 0 !important;
        padding: 0.8rem !important;
        font-size: 1.8rem !important;
        background-color: transparent !important;
        border: none !important;
        color: inherit !important;
    }
    span :global(.autocomplete:not(.hide-arrow):not(.is-loading)::after) {

        --size: 0.4rem;
        color: inherit  !important;
        border-color: #000 !important;
        border-width: 2.5px !important;
        top: calc(50% + var(--size)) !important;
        right: .8em  !important;
        width: var(--size) !important;
        height: var(--size) !important;
    }
</style>