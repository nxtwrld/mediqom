<script lang="ts">
    interface Option {
        value: string;
        label: string;
    }

    interface Props {
        options: Option[];
        value: string;
    }

    let { options, value = $bindable() }: Props = $props();

    function handleToggle(val: string) {
        value = val;
    }
</script>

<div class="unit-toggle">
    {#each options as option}
        <button
            type="button"
            class="toggle-option"
            class:-active={value === option.value}
            onclick={() => handleToggle(option.value)}
        >
            {option.label}
        </button>
    {/each}
</div>

<style>
    .unit-toggle {
        display: inline-flex;
        background-color: var(--color-surface);
        border-radius: var(--ui-radius-medium);
        padding: 0.2rem;
        gap: 0.2rem;
    }

    .toggle-option {
        padding: 0.35rem 0.75rem;
        border: none;
        background: transparent;
        border-radius: var(--ui-radius-small);
        font-weight: 500;
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .toggle-option.-active {
        background-color: var(--color-background);
        color: var(--color-text-primary);
        box-shadow: var(--shadow-small);
    }

    .toggle-option:hover:not(.-active) {
        color: var(--color-text-primary);
    }
</style>
