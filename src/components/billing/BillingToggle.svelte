<script lang="ts">
    import { t } from '$lib/i18n';
    import type { BillingCycle } from '$lib/billing/types';

    interface Props {
        value: BillingCycle;
        savingsPercent?: number;
        onchange?: (cycle: BillingCycle) => void;
    }

    let { value = $bindable(), savingsPercent = 17, onchange }: Props = $props();

    function handleToggle(cycle: BillingCycle) {
        value = cycle;
        onchange?.(cycle);
    }
</script>

<div class="billing-toggle">
    <button
        type="button"
        class="toggle-option"
        class:-active={value === 'monthly'}
        onclick={() => handleToggle('monthly')}
    >
        {$t('billing.monthly')}
    </button>
    <button
        type="button"
        class="toggle-option"
        class:-active={value === 'yearly'}
        onclick={() => handleToggle('yearly')}
    >
        {$t('billing.yearly')}
        {#if savingsPercent > 0}
            <span class="savings-badge">-{savingsPercent}%</span>
        {/if}
    </button>
</div>

<style>
    .billing-toggle {
        display: inline-flex;
        background-color: var(--color-surface);
        border-radius: var(--ui-radius-medium);
        padding: 0.25rem;
        gap: 0.25rem;
    }

    .toggle-option {
        padding: 0.5rem 1rem;
        border: none;
        background: transparent;
        border-radius: var(--ui-radius-small);
        font-weight: 500;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .toggle-option.-active {
        background-color: var(--color-background);
        color: var(--color-text-primary);
        box-shadow: var(--shadow-small);
    }

    .toggle-option:hover:not(.-active) {
        color: var(--color-text-primary);
    }

    .savings-badge {
        background-color: var(--color-positive);
        color: var(--color-positive-text);
        padding: 0.125rem 0.375rem;
        border-radius: var(--ui-radius-small);
        font-size: 0.75rem;
        font-weight: 600;
    }
</style>
