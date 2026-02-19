<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { t } from '$lib/i18n';
    import { getStripe } from '$lib/billing/stripe-client';
    import type { StripeEmbeddedCheckout } from '@stripe/stripe-js';

    interface Props {
        clientSecret: string;
        oncomplete?: () => void;
        onerror?: (message: string) => void;
    }

    let { clientSecret, oncomplete, onerror }: Props = $props();

    let checkoutContainer: HTMLDivElement;
    let checkout: StripeEmbeddedCheckout | null = null;
    let isLoading = $state(true);
    let errorMessage = $state<string | null>(null);

    onMount(async () => {
        try {
            const stripe = await getStripe();
            if (!stripe) {
                errorMessage = 'Payment system not available';
                onerror?.('Payment system not available');
                isLoading = false;
                return;
            }

            checkout = await stripe.initEmbeddedCheckout({
                clientSecret,
                onComplete: () => {
                    oncomplete?.();
                },
            });

            checkout.mount(checkoutContainer);
            isLoading = false;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to initialize checkout';
            errorMessage = message;
            onerror?.(message);
            isLoading = false;
        }
    });

    onDestroy(() => {
        if (checkout) {
            checkout.destroy();
            checkout = null;
        }
    });
</script>

<div class="embedded-checkout">
    {#if isLoading}
        <div class="loading">
            <div class="loader"></div>
            <span>{$t('billing.loading-checkout')}</span>
        </div>
    {/if}

    {#if errorMessage}
        <div class="error">
            <svg><use href="/icons.svg#warning"></use></svg>
            <span>{errorMessage}</span>
        </div>
    {/if}

    <div
        bind:this={checkoutContainer}
        class="checkout-container"
        class:-hidden={isLoading || !!errorMessage}
    ></div>
</div>

<style>
    .embedded-checkout {
        width: 100%;
        min-height: 400px;
        position: relative;
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
        width: 2.5rem;
        height: 2.5rem;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    .error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--ui-pad-xlarge);
        gap: var(--ui-pad-medium);
        color: var(--color-negative);
        text-align: center;
    }

    .error svg {
        width: 2rem;
        height: 2rem;
        fill: currentColor;
    }

    .checkout-container {
        width: 100%;
    }

    .checkout-container.-hidden {
        display: none;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
