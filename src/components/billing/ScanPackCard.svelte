<script lang="ts">
    import { t } from '$lib/i18n';
    import type { ScanPack } from '$lib/billing/types';
    import { formatPrice } from '$lib/billing/store';

    interface Props {
        pack: ScanPack;
        onpurchase?: () => void;
    }

    let { pack, onpurchase }: Props = $props();

    const pricePerScan = $derived(Math.round(pack.price_eur / pack.scans));
</script>

<div class="pack-card">
    <div class="pack-icon">
        <svg><use href="/icons.svg#document-scan"></use></svg>
    </div>

    <div class="pack-info">
        <h4 class="pack-name">{pack.name}</h4>
        <p class="pack-scans">
            <span class="count">{pack.scans}</span> {$t('billing.scans')}
        </p>
        <p class="pack-price-per">
            {formatPrice(pricePerScan)}/{$t('billing.scan')}
        </p>
    </div>

    <div class="pack-price">
        <span class="price">{formatPrice(pack.price_eur)}</span>
        <span class="one-time">{$t('billing.one-time')}</span>
    </div>

    <button class="button -outline" onclick={onpurchase}>
        {$t('billing.buy-now')}
    </button>
</div>

<style>
    .pack-card {
        display: flex;
        align-items: center;
        gap: var(--ui-pad-medium);
        padding: var(--ui-pad-medium);
        background-color: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-medium);
    }

    .pack-icon {
        width: 3rem;
        height: 3rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--color-primary-light, var(--color-primary));
        border-radius: var(--ui-radius-medium);
    }

    .pack-icon svg {
        width: 1.5rem;
        height: 1.5rem;
        fill: var(--color-primary);
    }

    .pack-info {
        flex-grow: 1;
    }

    .pack-name {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }

    .pack-scans {
        margin: 0.25rem 0 0 0;
        color: var(--color-text-secondary);
        font-size: 0.875rem;
    }

    .pack-scans .count {
        font-weight: 600;
        color: var(--color-text-primary);
    }

    .pack-price-per {
        margin: 0.125rem 0 0 0;
        color: var(--color-text-tertiary);
        font-size: 0.75rem;
    }

    .pack-price {
        text-align: right;
    }

    .price {
        display: block;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary);
    }

    .one-time {
        display: block;
        font-size: 0.75rem;
        color: var(--color-text-secondary);
    }

    .pack-card .button {
        flex-shrink: 0;
    }

    @media screen and (max-width: 600px) {
        .pack-card {
            flex-wrap: wrap;
        }

        .pack-price {
            text-align: left;
        }

        .pack-card .button {
            width: 100%;
            margin-top: var(--ui-pad-small);
        }
    }
</style>
