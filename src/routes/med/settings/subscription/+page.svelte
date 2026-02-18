<script lang="ts">
    import { page } from '$app/stores';
    import { onMount } from 'svelte';
    import { t } from '$lib/i18n';
    import {
        subscription,
        isLoading,
        error,
        loadSubscription,
        openPortal,
    } from '$lib/billing/store';
    import SubscriptionStatus from '$components/billing/SubscriptionStatus.svelte';
    import UpgradeModal from '$components/billing/UpgradeModal.svelte';

    let showUpgradeModal = $state(false);
    let upgradeMode: 'upgrade' | 'credits' = $state('upgrade');

    // Check for success/canceled query params
    const searchParams = $derived($page.url.searchParams);
    const showSuccess = $derived(searchParams.get('success') === 'true');
    const showCanceled = $derived(searchParams.get('canceled') === 'true');

    function handleUpgrade() {
        upgradeMode = 'upgrade';
        showUpgradeModal = true;
    }

    function handleBuyCredits() {
        upgradeMode = 'credits';
        showUpgradeModal = true;
    }

    async function handleManageBilling() {
        const url = await openPortal();
        if (url) {
            window.location.href = url;
        }
    }

    function closeModal() {
        showUpgradeModal = false;
    }

    onMount(() => {
        // Refresh subscription data if we came from checkout
        if (showSuccess || showCanceled) {
            loadSubscription();
            // Clean up URL params
            const url = new URL(window.location.href);
            url.searchParams.delete('success');
            url.searchParams.delete('canceled');
            url.searchParams.delete('session_id');
            window.history.replaceState({}, '', url.toString());
        }
    });
</script>

<svelte:head>
    <title>{$t('billing.subscription')} - {$t('app.name')}</title>
</svelte:head>

<div class="subscription-page">
    {#if showSuccess}
        <div class="alert -success">
            <svg><use href="/icons.svg#check-circle"></use></svg>
            <span>{$t('billing.payment-success')}</span>
        </div>
    {/if}

    {#if showCanceled}
        <div class="alert -warning">
            <svg><use href="/icons.svg#info"></use></svg>
            <span>{$t('billing.payment-canceled')}</span>
        </div>
    {/if}

    {#if $error}
        <div class="alert -error">
            <svg><use href="/icons.svg#alert-triangle"></use></svg>
            <span>{$error}</span>
        </div>
    {/if}

    {#if $isLoading && !$subscription}
        <div class="loading">
            <div class="loader"></div>
            <span>{$t('billing.loading')}</span>
        </div>
    {:else if $subscription}
        <SubscriptionStatus
            subscription={$subscription}
            onupgrade={handleUpgrade}
            onbuycredits={handleBuyCredits}
            onmanage={handleManageBilling}
        />

        <section class="faq-section">
            <h3>{$t('billing.faq.title')}</h3>

            <div class="faq-item">
                <h4>{$t('billing.faq.what-are-scans')}</h4>
                <p>{$t('billing.faq.what-are-scans-answer')}</p>
            </div>

            <div class="faq-item">
                <h4>{$t('billing.faq.credits-expire')}</h4>
                <p>{$t('billing.faq.credits-expire-answer')}</p>
            </div>

            <div class="faq-item">
                <h4>{$t('billing.faq.base-scans-reset')}</h4>
                <p>{$t('billing.faq.base-scans-reset-answer')}</p>
            </div>

            <div class="faq-item">
                <h4>{$t('billing.faq.cancel-subscription')}</h4>
                <p>{$t('billing.faq.cancel-subscription-answer')}</p>
            </div>
        </section>
    {:else}
        <div class="empty-state">
            <svg><use href="/icons.svg#credit-card"></use></svg>
            <p>{$t('billing.no-subscription')}</p>
            <button class="button -primary" onclick={handleUpgrade}>
                {$t('billing.get-started')}
            </button>
        </div>
    {/if}
</div>

{#if showUpgradeModal}
    <UpgradeModal mode={upgradeMode} onclose={closeModal} />
{/if}

<style>
    .subscription-page {
        max-width: 700px;
    }

    .alert {
        display: flex;
        align-items: center;
        gap: var(--ui-pad-small);
        padding: var(--ui-pad-medium);
        border-radius: var(--ui-radius-medium);
        margin-bottom: var(--ui-pad-large);
    }

    .alert svg {
        width: 1.25rem;
        height: 1.25rem;
        fill: currentColor;
        flex-shrink: 0;
    }

    .alert.-success {
        background-color: var(--color-positive-light, rgba(34, 197, 94, 0.1));
        color: var(--color-positive);
    }

    .alert.-warning {
        background-color: var(--color-warning-light, rgba(234, 179, 8, 0.1));
        color: var(--color-warning);
    }

    .alert.-error {
        background-color: var(--color-negative-light, rgba(239, 68, 68, 0.1));
        color: var(--color-negative);
    }

    .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ui-pad-xlarge);
        gap: var(--ui-pad-medium);
        color: var(--color-text-secondary);
    }

    .loader {
        width: 2rem;
        height: 2rem;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ui-pad-xlarge);
        text-align: center;
        color: var(--color-text-secondary);
    }

    .empty-state svg {
        width: 4rem;
        height: 4rem;
        fill: var(--color-text-tertiary);
        margin-bottom: var(--ui-pad-medium);
    }

    .empty-state p {
        margin-bottom: var(--ui-pad-medium);
    }

    .faq-section {
        margin-top: var(--ui-pad-xlarge);
        padding-top: var(--ui-pad-large);
        border-top: 1px solid var(--color-border);
    }

    .faq-section h3 {
        font-size: 1rem;
        font-weight: 600;
        margin: 0 0 var(--ui-pad-medium) 0;
        color: var(--color-text-primary);
    }

    .faq-item {
        margin-bottom: var(--ui-pad-medium);
    }

    .faq-item h4 {
        font-size: 0.875rem;
        font-weight: 600;
        margin: 0 0 0.25rem 0;
        color: var(--color-text-primary);
    }

    .faq-item p {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        margin: 0;
        line-height: 1.5;
    }
</style>
