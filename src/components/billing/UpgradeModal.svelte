<script lang="ts">
    import { t } from '$lib/i18n';
    import Modal from '$components/ui/Modal.svelte';
    import BillingToggle from './BillingToggle.svelte';
    import PlanCard from './PlanCard.svelte';
    import ScanPackCard from './ScanPackCard.svelte';
    import EmbeddedCheckout from './EmbeddedCheckout.svelte';
    import {
        tiers,
        packs,
        subscription,
        isLoading,
        createEmbeddedCheckout,
        createEmbeddedPackCheckout,
        getSessionStatus,
        loadTiers,
        loadPacks,
        loadSubscription,
        getYearlySavingsPercent,
    } from '$lib/billing/store';
    import type { SubscriptionTierId, BillingCycle } from '$lib/billing/types';
    import { onMount } from 'svelte';

    interface Props {
        mode?: 'upgrade' | 'credits';
        recommendedTier?: SubscriptionTierId;
        onclose?: () => void;
    }

    let { mode = 'upgrade', recommendedTier, onclose }: Props = $props();

    // View state: 'select' | 'checkout' | 'success' | 'error'
    type ViewState = 'select' | 'checkout' | 'success' | 'error';
    let viewState: ViewState = $state('select');
    let clientSecret = $state<string | null>(null);
    let checkoutError = $state<string | null>(null);
    let selectedTierName = $state<string | null>(null);

    let billingCycle: BillingCycle = $state('yearly');
    let currentTab: 'plans' | 'credits' = $state(mode === 'credits' ? 'credits' : 'plans');

    const savingsPercent = $derived(
        $tiers.length > 0 ? getYearlySavingsPercent($tiers[1]) : 17
    );

    const sortedTiers = $derived(
        [...$tiers].sort((a, b) => a.sort_order - b.sort_order)
    );

    async function handleSelectPlan(tierId: SubscriptionTierId) {
        const tier = $tiers.find(t => t.id === tierId);
        selectedTierName = tier?.name ?? tierId;

        const result = await createEmbeddedCheckout(tierId, billingCycle);
        if (result) {
            clientSecret = result.clientSecret;
            viewState = 'checkout';
        } else {
            checkoutError = 'Failed to initialize checkout. Please try again.';
            viewState = 'error';
        }
    }

    async function handleBuyPack(packId: string) {
        const pack = $packs.find(p => p.id === packId);
        selectedTierName = pack?.name ?? packId;

        const result = await createEmbeddedPackCheckout(packId);
        if (result) {
            clientSecret = result.clientSecret;
            viewState = 'checkout';
        } else {
            checkoutError = 'Failed to initialize checkout. Please try again.';
            viewState = 'error';
        }
    }

    function handleCheckoutComplete() {
        viewState = 'success';
        // Refresh subscription data
        loadSubscription();
    }

    function handleCheckoutError(message: string) {
        checkoutError = message;
        viewState = 'error';
    }

    function handleBackToPlans() {
        viewState = 'select';
        clientSecret = null;
        checkoutError = null;
        selectedTierName = null;
    }

    function handleClose() {
        // If success, close immediately
        // Otherwise, reset state first
        if (viewState !== 'success') {
            viewState = 'select';
            clientSecret = null;
            checkoutError = null;
            selectedTierName = null;
        }
        onclose?.();
    }

    onMount(() => {
        if ($tiers.length === 0) loadTiers();
        if ($packs.length === 0) loadPacks();
    });
</script>

<Modal onclose={handleClose} style="width: 900px; max-width: 95vw;">
    <div class="upgrade-modal">
        {#if viewState === 'select'}
            <!-- Plan Selection View -->
            <div class="modal-header">
                <h2>{$t('billing.choose-your-plan')}</h2>
                <p class="subtitle">{$t('billing.upgrade-subtitle')}</p>
            </div>

            <div class="tabs">
                <button
                    class="tab"
                    class:-active={currentTab === 'plans'}
                    onclick={() => (currentTab = 'plans')}
                >
                    {$t('billing.subscription-plans')}
                </button>
                <button
                    class="tab"
                    class:-active={currentTab === 'credits'}
                    onclick={() => (currentTab = 'credits')}
                >
                    {$t('billing.scan-credits')}
                </button>
            </div>

            {#if currentTab === 'plans'}
                <div class="billing-toggle-wrapper">
                    <BillingToggle bind:value={billingCycle} {savingsPercent} />
                </div>

                <div class="plans-grid">
                    {#each sortedTiers as tier (tier.id)}
                        <PlanCard
                            {tier}
                            {billingCycle}
                            isCurrentPlan={$subscription?.tier_id === tier.id}
                            isRecommended={recommendedTier === tier.id || (!recommendedTier && tier.id === 'caretaker')}
                            onselect={() => handleSelectPlan(tier.id)}
                        />
                    {/each}
                </div>
            {:else}
                <div class="credits-section">
                    <div class="credits-info">
                        <h3>{$t('billing.scan-credits-title')}</h3>
                        <p>{$t('billing.scan-credits-description')}</p>
                    </div>

                    <div class="packs-list">
                        {#each $packs as pack (pack.id)}
                            <ScanPackCard {pack} onpurchase={() => handleBuyPack(pack.id)} />
                        {/each}
                    </div>

                    {#if $subscription}
                        <div class="current-credits">
                            <svg><use href="/icons.svg#info"></use></svg>
                            <span>
                                {$t('billing.current-credits')}: <strong>{$subscription.scans_credits}</strong>
                            </span>
                        </div>
                    {/if}
                </div>
            {/if}

            {#if $isLoading}
                <div class="loading-overlay">
                    <div class="loader"></div>
                    <span>{$t('billing.preparing-checkout')}</span>
                </div>
            {/if}

        {:else if viewState === 'checkout' && clientSecret}
            <!-- Embedded Checkout View -->
            <div class="checkout-view">
                <div class="checkout-header">
                    <button class="back-button" onclick={handleBackToPlans}>
                        <svg><use href="/icons.svg#chevron-left"></use></svg>
                        {$t('billing.back-to-plans')}
                    </button>
                    <h2>{$t('billing.complete-purchase')}</h2>
                    {#if selectedTierName}
                        <p class="checkout-subtitle">{selectedTierName}</p>
                    {/if}
                </div>

                <EmbeddedCheckout
                    {clientSecret}
                    oncomplete={handleCheckoutComplete}
                    onerror={handleCheckoutError}
                />
            </div>

        {:else if viewState === 'success'}
            <!-- Success View -->
            <div class="success-view">
                <div class="success-icon">
                    <svg><use href="/icons.svg#check-circle"></use></svg>
                </div>
                <h2>{$t('billing.payment-successful')}</h2>
                <p>{$t('billing.subscription-updated')}</p>
                <button class="button -primary" onclick={handleClose}>
                    {$t('billing.continue')}
                </button>
            </div>

        {:else if viewState === 'error'}
            <!-- Error View -->
            <div class="error-view">
                <div class="error-icon">
                    <svg><use href="/icons.svg#warning"></use></svg>
                </div>
                <h2>{$t('billing.payment-failed')}</h2>
                <p>{checkoutError || $t('billing.generic-error')}</p>
                <div class="error-actions">
                    <button class="button -secondary" onclick={handleBackToPlans}>
                        {$t('billing.try-again')}
                    </button>
                    <button class="button -outline" onclick={handleClose}>
                        {$t('billing.cancel')}
                    </button>
                </div>
            </div>
        {/if}
    </div>
</Modal>

<style>
    .upgrade-modal {
        position: relative;
        min-height: 400px;
    }

    .modal-header {
        text-align: center;
        margin-bottom: var(--ui-pad-large);
    }

    .modal-header h2 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
    }

    .subtitle {
        color: var(--color-text-secondary);
        margin: 0;
    }

    .tabs {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        margin-bottom: var(--ui-pad-large);
    }

    .tab {
        padding: 0.75rem 1.5rem;
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font-weight: 500;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s ease;
    }

    .tab.-active {
        color: var(--color-primary);
        border-bottom-color: var(--color-primary);
    }

    .tab:hover:not(.-active) {
        color: var(--color-text-primary);
    }

    .billing-toggle-wrapper {
        display: flex;
        justify-content: center;
        margin-bottom: var(--ui-pad-large);
    }

    .plans-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: var(--ui-pad-medium);
    }

    .credits-section {
        max-width: 600px;
        margin: 0 auto;
    }

    .credits-info {
        text-align: center;
        margin-bottom: var(--ui-pad-large);
    }

    .credits-info h3 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0 0 0.5rem 0;
    }

    .credits-info p {
        color: var(--color-text-secondary);
        margin: 0;
    }

    .packs-list {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-medium);
    }

    .current-credits {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        margin-top: var(--ui-pad-large);
        padding: var(--ui-pad-medium);
        background-color: var(--color-surface);
        border-radius: var(--ui-radius-medium);
        color: var(--color-text-secondary);
    }

    .current-credits svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    .loading-overlay {
        position: absolute;
        inset: 0;
        background-color: rgba(255, 255, 255, 0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--ui-pad-medium);
        border-radius: var(--ui-radius-large);
        z-index: 10;
    }

    .loader {
        width: 2rem;
        height: 2rem;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    /* Checkout View */
    .checkout-view {
        min-height: 500px;
    }

    .checkout-header {
        text-align: center;
        margin-bottom: var(--ui-pad-large);
        position: relative;
    }

    .checkout-header h2 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
    }

    .checkout-subtitle {
        color: var(--color-text-secondary);
        margin: 0;
    }

    .back-button {
        position: absolute;
        left: 0;
        top: 0;
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.5rem;
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 0.875rem;
        cursor: pointer;
        transition: color 0.2s ease;
    }

    .back-button:hover {
        color: var(--color-text-primary);
    }

    .back-button svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    /* Success View */
    .success-view {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--ui-pad-xlarge);
        min-height: 400px;
    }

    .success-icon {
        margin-bottom: var(--ui-pad-large);
    }

    .success-icon svg {
        width: 4rem;
        height: 4rem;
        fill: var(--color-positive);
    }

    .success-view h2 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
    }

    .success-view p {
        color: var(--color-text-secondary);
        margin: 0 0 var(--ui-pad-large) 0;
    }

    /* Error View */
    .error-view {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--ui-pad-xlarge);
        min-height: 400px;
    }

    .error-icon {
        margin-bottom: var(--ui-pad-large);
    }

    .error-icon svg {
        width: 4rem;
        height: 4rem;
        fill: var(--color-negative);
    }

    .error-view h2 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
    }

    .error-view p {
        color: var(--color-text-secondary);
        margin: 0 0 var(--ui-pad-large) 0;
        max-width: 400px;
    }

    .error-actions {
        display: flex;
        gap: var(--ui-pad-medium);
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
