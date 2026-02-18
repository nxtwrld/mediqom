<script lang="ts">
    import { t } from '$lib/i18n';
    import type { SubscriptionTier, BillingCycle } from '$lib/billing/types';
    import { formatPrice, getTierFeatures } from '$lib/billing/store';

    interface Props {
        tier: SubscriptionTier;
        billingCycle: BillingCycle;
        isCurrentPlan?: boolean;
        isRecommended?: boolean;
        onselect?: () => void;
    }

    let { tier, billingCycle, isCurrentPlan = false, isRecommended = false, onselect }: Props = $props();

    const price = $derived(billingCycle === 'yearly' ? tier.price_yearly_eur : tier.price_monthly_eur);
    const pricePerMonth = $derived(billingCycle === 'yearly' ? Math.round(tier.price_yearly_eur / 12) : tier.price_monthly_eur);
    const features = $derived(getTierFeatures(tier.id));
    const isFree = $derived(tier.id === 'free');
</script>

<div class="plan-card" class:-recommended={isRecommended} class:-current={isCurrentPlan}>
    {#if isRecommended}
        <div class="recommended-badge">{$t('billing.recommended')}</div>
    {/if}

    <div class="plan-header">
        <h3 class="plan-name">{tier.name}</h3>
        <div class="plan-price">
            {#if isFree}
                <span class="price">{$t('billing.free')}</span>
            {:else}
                <span class="price">{formatPrice(pricePerMonth)}</span>
                <span class="period">/{$t('billing.month')}</span>
            {/if}
        </div>
        {#if !isFree && billingCycle === 'yearly'}
            <div class="yearly-total">
                {formatPrice(price)}/{$t('billing.year')}
            </div>
        {/if}
    </div>

    <div class="plan-limits">
        <div class="limit">
            <svg class="limit-icon"><use href="/icons.svg#user"></use></svg>
            <span>
                {#if tier.profile_limit === null}
                    {$t('billing.unlimited-profiles')}
                {:else}
                    {tier.profile_limit} {tier.profile_limit === 1 ? $t('billing.profile') : $t('billing.profiles')}
                {/if}
            </span>
        </div>
        <div class="limit">
            <svg class="limit-icon"><use href="/icons.svg#document"></use></svg>
            <span>{tier.scan_limit} {$t('billing.scans-per-year')}</span>
        </div>
    </div>

    <ul class="features">
        {#each features as feature}
            <li>
                <svg class="check-icon"><use href="/icons.svg#check"></use></svg>
                {feature}
            </li>
        {/each}
    </ul>

    <div class="plan-action">
        {#if isCurrentPlan}
            <button class="button -secondary" disabled>
                {$t('billing.current-plan')}
            </button>
        {:else if isFree}
            <button class="button -outline" disabled>
                {$t('billing.free-tier')}
            </button>
        {:else}
            <button class="button -primary" onclick={onselect}>
                {$t('billing.upgrade-to')} {tier.name}
            </button>
        {/if}
    </div>
</div>

<style>
    .plan-card {
        display: flex;
        flex-direction: column;
        padding: var(--ui-pad-large);
        background-color: var(--color-background);
        border: 2px solid var(--color-border);
        border-radius: var(--ui-radius-large);
        position: relative;
        transition: all 0.2s ease;
    }

    .plan-card.-recommended {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px var(--color-primary);
    }

    .plan-card.-current {
        border-color: var(--color-positive);
        background-color: var(--color-surface);
    }

    .recommended-badge {
        position: absolute;
        top: -0.75rem;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--color-primary);
        color: var(--color-primary-text);
        padding: 0.25rem 0.75rem;
        border-radius: var(--ui-radius-small);
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .plan-header {
        text-align: center;
        margin-bottom: var(--ui-pad-medium);
    }

    .plan-name {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
    }

    .plan-price {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 0.25rem;
    }

    .price {
        font-size: 2rem;
        font-weight: 700;
        color: var(--color-text-primary);
    }

    .period {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
    }

    .yearly-total {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        margin-top: 0.25rem;
    }

    .plan-limits {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: var(--ui-pad-medium) 0;
        border-top: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
        margin-bottom: var(--ui-pad-medium);
    }

    .limit {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--color-text-secondary);
    }

    .limit-icon {
        width: 1.25rem;
        height: 1.25rem;
        fill: currentColor;
    }

    .features {
        list-style: none;
        padding: 0;
        margin: 0 0 var(--ui-pad-large) 0;
        flex-grow: 1;
    }

    .features li {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        padding: 0.375rem 0;
        color: var(--color-text-secondary);
        font-size: 0.875rem;
    }

    .check-icon {
        width: 1rem;
        height: 1rem;
        fill: var(--color-positive);
        flex-shrink: 0;
        margin-top: 0.125rem;
    }

    .plan-action {
        margin-top: auto;
    }

    .plan-action .button {
        width: 100%;
    }
</style>
