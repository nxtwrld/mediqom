<script lang="ts" module>
    export type SelectOptions = {
        key: string;
        value: string;
    }[];
</script>
<script lang="ts">

    interface Props {
        value: string | string[] | null;
        placeholder?: string;
        options?: SelectOptions;
        label?: string | undefined;
        required?: boolean;
        multiple?: boolean;
        size?: number;
        tabindex?: number;
        disabled?: boolean;
        id?: string;
        class?: string;
        children?: import('svelte').Snippet;
    }

    let {
        value = $bindable(),
        placeholder = 'Select',
        options = [],
        label = undefined,
        required = false,
        multiple = false,
        size = options.length,
        tabindex = 0,
        disabled = false,
        id = (window as any)?.crypto.getRandomValues(new Uint32Array(1))[0].toString(16),
        class: className = 'input',
        children
    }: Props = $props();
    

</script>

<div class={className}>
    {#if children || label}
        <label for={id}>
            {#if label}
                {label}
            {:else}
                {@render children?.()}
            {/if}
        </label>
    {/if}

    {#if multiple}
        <select {tabindex} {disabled} bind:value {id} {required} multiple {size}>
            {#each options as {key, value}}
                <option value={key}>{value}</option>
            {/each}
        </select>
    {:else}
        <select {tabindex} bind:value {id} {required}>
            {#if placeholder}
                <option value="" disabled selected>{placeholder}</option>
            {/if}
            {#each options as {key, value}}
                <option value={key}>{value}</option>
            {/each}
        </select>
    {/if}
</div>
