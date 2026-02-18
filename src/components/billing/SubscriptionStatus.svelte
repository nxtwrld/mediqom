<script lang="ts">
    import { t } from '$lib/i18n';
    import type { SubscriptionWithUsage } from '$lib/billing/types';
    import { formatPrice } from '$lib/billing/store';
    import ProgressBar from '$components/ui/ProgressBar.svelte';

    interface Props {
        subscription: SubscriptionWithUsage;
        onupgrade?: () => void;
        onbuycredits?: () => void;
        onmanage?: () => void;
    }

    let { subscription, onupgrade, onbuycredits, onmanage }: Props = $props();

    const scanUsagePercent = $derived(
        subscription.scans_base > 0
            ? Math.round((subscription.scans_used / subscription.scans_base) * 100)
            : 0
    );

    const profileUsagePercent = $derived(
        subscription.tier?.profile_limit
            ? Math.round((subscription.profile_count / subscription.tier.profile_limit) * 100)
            : 0
    );

    const resetDate = $derived(
        subscription.scans_reset_at
            ? new Date(subscription.scans_reset_at).toLocaleDateString()
            : null
    );

    const periodEndDate = $derived(
        subscription.current_period_end
            ? new Date(subscription.current_period_end).toLocaleDateString()
            : null
    );

    const statusClass = $derived(() => {
        switch (subscription.status) {
            case 'active':
            case 'trialing':
                return '-positive';
            case 'past_due':
                return '-warning';
            case 'canceled':
            case 'expired':
                return '-negative';
            default:
                return '';
        }
    });

    const isFree = $derived(subscription.tier_id === 'free');
    const hasStripeSubscription = $derived(!!subscription.stripe_subscription_id);
</script>

<div class="subscription-status">
    <!-- Current Plan -->
    <div class="status-section">
        <div class="section-header">
            <h3>{$t('billing.current-plan')}</h3>
            <span class="status-badge {statusClass()}">
                {$t(`billing.status.${subscription.status}`)}
            </span>
        </div>

        <div class="plan-info">
            <span class="tier-name">{subscription.tier?.name || subscription.tier_id}</span>
            {#if periodEndDate && !isFree}
                <span class="next-billing">
                    {#if subscription.cancel_at_period_end}
                        {$t('billing.ends-on')} {periodEndDate}
                    {:else}
                        {$t('billing.renews-on')} {periodEndDate}
                    {/if}
                </span>
            {/if}
        </div>
    </div>

    <!-- Scan Usage -->
    <div class="status-section">
        <h4>{$t('billing.scan-usage')}</h4>

        <div class="usage-row">
            <div class="usage-label">
                <span>{$t('billing.base-scans')}</span>
                <span class="usage-count">
                    {subscription.scans_used}/{subscription.scans_base}
                </span>
            </div>
            <ProgressBar
                value={scanUsagePercent}
                class={scanUsagePercent > 80 ? '-warning' : ''}
            />
        </div>

        {#if subscription.scans_credits > 0}
            <div class="usage-info">
                <svg class="info-icon"><use href="/icons.svg#plus-circle"></use></svg>
                <span>
                    {subscription.scans_credits} {$t('billing.credits-available')}
                </span>
            </div>
        {/if}

        <div class="usage-info">
            <svg class="info-icon"><use href="/icons.svg#calendar"></use></svg>
            <span>
                <strong>{subscription.scans_available}</strong> {$t('billing.scans-available')}
            </span>
        </div>

        {#if resetDate}
            <div class="usage-info -muted">
                <svg class="info-icon"><use href="/icons.svg#refresh"></use></svg>
                <span>{$t('billing.resets-on')} {resetDate}</span>
            </div>
        {/if}
    </div>

    <!-- Profile Usage -->
    <div class="status-section">
        <h4>{$t('billing.profile-usage')}</h4>

        {#if subscription.tier?.profile_limit === null}
            <div class="usage-info">
                <svg class="info-icon"><use href="/icons.svg#users"></use></svg>
                <span>
                    {subscription.profile_count} {$t('billing.profiles')} ({$t('billing.unlimited')})
                </span>
            </div>
        {:else}
            <div class="usage-row">
                <div class="usage-label">
                    <span>{$t('billing.profiles')}</span>
                    <span class="usage-count">
                        {subscription.profile_count}/{subscription.tier?.profile_limit || 1}
                    </span>
                </div>
                <ProgressBar
                    value={profileUsagePercent}
                    class={profileUsagePercent >= 100 ? '-warning' : ''}
                />
            </div>
        {/if}
    </div>

    <!-- Actions -->
    <div class="status-actions">
        {#if !isFree}
            <button class="button -outline" onclick={onbuycredits}>
                <svg><use href="/icons.svg#plus"></use></svg>
                {$t('billing.buy-credits')}
            </button>
        {/if}

        {#if isFree}
            <button class="button -primary" onclick={onupgrade}>
                <svg><use href="/icons.svg#arrow-up"></use></svg>
                {$t('billing.upgrade')}
            </button>
        {:else}
            <button class="button -outline" onclick={onupgrade}>
                <svg><use href="/icons.svg#arrow-up"></use></svg>
                {$t('billing.change-plan')}
            </button>
        {/if}

        {#if hasStripeSubscription}
            <button class="button -text" onclick={onmanage}>
                <svg><use href="/icons.svg#settings"></use></svg>
                {$t('billing.manage-billing')}
            </button>
        {/if}
    </div>
</div>

<style>
    .subscription-status {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-large);
    }

    .status-section {
        padding: var(--ui-pad-medium);
        background-color: var(--color-surface);
        border-radius: var(--ui-radius-medium);
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--ui-pad-small);
    }

    .section-header h3 {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0;
    }

    .status-badge {
        padding: 0.25rem 0.5rem;
        border-radius: var(--ui-radius-small);
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: capitalize;
    }

    .status-badge.-positive {
        background-color: var(--color-positive-light, rgba(34, 197, 94, 0.1));
        color: var(--color-positive);
    }

    .status-badge.-warning {
        background-color: var(--color-warning-light, rgba(234, 179, 8, 0.1));
        color: var(--color-warning);
    }

    .status-badge.-negative {
        background-color: var(--color-negative-light, rgba(239, 68, 68, 0.1));
        color: var(--color-negative);
    }

    .plan-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .tier-name {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-text-primary);
    }

    .next-billing {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
    }

    .status-section h4 {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-secondary);
        margin: 0 0 var(--ui-pad-small) 0;
    }

    .usage-row {
        margin-bottom: var(--ui-pad-small);
    }

    .usage-label {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.25rem;
        font-size: 0.875rem;
    }

    .usage-count {
        font-weight: 600;
        color: var(--color-text-primary);
    }

    .usage-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        padding: 0.25rem 0;
    }

    .usage-info.-muted {
        color: var(--color-text-tertiary);
        font-size: 0.75rem;
    }

    .info-icon {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
        flex-shrink: 0;
    }

    .status-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ui-pad-small);
    }

    .status-actions .button {
        flex: 1;
        min-width: 150px;
    }

    .status-actions .button svg {
        width: 1rem;
        height: 1rem;
        margin-right: 0.5rem;
        fill: currentColor;
    }

    @media screen and (max-width: 600px) {
        .status-actions {
            flex-direction: column;
        }

        .status-actions .button {
            width: 100%;
        }
    }
</style>
