<script lang="ts">
    import { t } from '$lib/i18n';

    interface Props {
        phone?: string;
        email?: string;
        address?: string;
    }

    let { phone, email, address }: Props = $props();
</script>

<div class="actions -vertical">
    {#if phone}
        <a href="tel:{phone}" aria-label={$t('contacts.call')}>
            <svg><use href="/icons.svg#phone" /></svg>
        </a>
    {/if}
    {#if email}
        <a href="mailto:{email}" aria-label={$t('contacts.email')}>
            <svg><use href="/icons.svg#email" /></svg>
        </a>
    {/if}
    {#if address}
        <a href="https://www.google.com/maps/search/?q={encodeURIComponent(address)}" target="_blank" aria-label={$t('contacts.map')}>
            <svg><use href="/icons.svg#location-medical" /></svg>
        </a>
    {/if}
    <div class="-filler"></div>
</div>

<style>
    .actions {
        width: var(--toolbar-height);
        display: flex;
        gap: var(--gap);
        justify-content: stretch;
        align-items: stretch;
    }

    .actions.-vertical {
        flex-direction: column;
    }

    .actions .-filler {
        flex-grow: 1;
        background-color: var(--color-background);
    }

    .actions a {
        width: var(--toolbar-height);
        height: var(--toolbar-height);
        border: none;
        background-color: var(--color-background);
        color: var(--color-interactivity);
        display: flex;
        justify-content: center;
        align-items: center;
        padding: .5rem;
    }

    .actions a svg {
        fill: currentColor;
        height: 100%;
        width: 100%;
    }

    .actions a:hover {
        background-color: var(--color-interactivity);
        color: var(--color-interactivity-text);
    }

    @media (max-width: 768px) {
        .actions.-vertical {
            flex-direction: row;
        }

        .actions {
            width: auto;
        }
    }
</style>
