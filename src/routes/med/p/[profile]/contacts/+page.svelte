<script lang="ts">
    import { profile } from '$lib/profiles';
    import { t } from '$lib/i18n';
    import { contactsByProfile, removeContact, markContactSynced } from '$lib/contacts/store';
    import { downloadVCard } from '$lib/contacts/vcard-export';
    import { isNativePlatform } from '$lib/config/platform';
    import { confirm } from '$lib/ui';
    import { get } from 'svelte/store';
    import { _ } from '$lib/i18n';
    import type { ProviderContact } from '$lib/contacts/types.d';
    import ProfileImage from '$components/profile/ProfileImage.svelte';

    let search = $state('');
    let expandedId: string | null = $state(null);

    const contacts = $derived($profile?.id ? contactsByProfile($profile.id) : undefined);

    let filtered = $derived(
        ($contacts || []).filter((c: ProviderContact) => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (
                c.vcard.fn?.toLowerCase().includes(q) ||
                c.performer.specialty?.toLowerCase().includes(q) ||
                c.performer.institution?.name?.toLowerCase().includes(q) ||
                c.performer.role?.toLowerCase().replace(/_/g, ' ').includes(q)
            );
        })
    );

    function toggleExpand(id: string) {
        expandedId = expandedId === id ? null : id;
    }

    function formatRole(role: string): string {
        return role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    }

    async function handleAddToPhone(contact: ProviderContact) {
        if (isNativePlatform()) {
            // TODO: Phase 2 - native contacts integration
            // For now, fall back to VCard download
            downloadVCard(contact);
        } else {
            downloadVCard(contact);
        }
        if ($profile?.id) {
            await markContactSynced($profile.id, contact.id);
        }
    }

    async function handleDelete(contact: ProviderContact) {
        const message = get(_)('contacts.confirm-delete', {
            values: { name: contact.vcard.fn || '' },
        });
        if (await confirm(message)) {
            if ($profile?.id) {
                await removeContact($profile.id, contact.id);
            }
        }
    }
</script>

<div class="page-section">
    <h2 class="h2">{$t('contacts.title')}</h2>

    <div class="search-bar">
        <input
            type="search"
            class="input"
            placeholder={$t('contacts.search-placeholder')}
            bind:value={search}
        />
    </div>

    {#if filtered.length === 0}
        <p class="p empty-state">{$t('contacts.empty')}</p>
    {:else}
        <div class="contacts-list">
            {#each filtered as contact (contact.id)}
                <div class="contact-card card" class:expanded={expandedId === contact.id}>
                    <button
                        class="card-header"
                        onclick={() => toggleExpand(contact.id)}
                        type="button"
                        aria-expanded={expandedId === contact.id}
                    >
                        <div class="header-info">
                            <p class="name">{contact.vcard.fn || 'Unknown'}</p>
                            {#if contact.performer.role}
                                <p class="role">{formatRole(contact.performer.role)}</p>
                            {/if}
                            {#if contact.performer.specialty}
                                <p class="specialty">{contact.performer.specialty}</p>
                            {/if}
                        </div>
                        <div class="header-meta">
                            {#if contact.syncedToDevice}
                                <span class="sync-badge" title={$t('contacts.synced-to-device')}>
                                    <svg><use href="/icons-o.svg#checked" /></svg>
                                </span>
                            {/if}
                            {#if contact.sourceDocuments.length > 0}
                                <span class="doc-count" title="{contact.sourceDocuments.length} documents">
                                    {contact.sourceDocuments.length}
                                    <svg><use href="/icons.svg#report" /></svg>
                                </span>
                            {/if}
                            <span class="expand-toggle" aria-hidden="true">
                                <svg class="chevron"><use href="/icons.svg#chevron-down" /></svg>
                            </span>
                        </div>
                    </button>

                    {#if expandedId === contact.id}
                        <div class="card-body">
                            <div class="image">
                                <ProfileImage size={6} />
                            </div>
                            <div class="actions -vertical">
                                {#if contact.vcard.tel?.[0]?.value}
                                    <a href="tel:{contact.vcard.tel[0].value}" aria-label={$t('contacts.call')}>
                                        <svg><use href="/icons.svg#phone" /></svg>
                                    </a>
                                {/if}
                                {#if contact.vcard.email?.[0]?.value}
                                    <a href="mailto:{contact.vcard.email[0].value}" aria-label={$t('contacts.email')}>
                                        <svg><use href="/icons.svg#email" /></svg>
                                    </a>
                                {/if}
                                {#if contact.vcard.adr?.[0]?.streetAddress || contact.performer.institution?.address}
                                    {@const address = contact.performer.institution?.address || contact.vcard.adr?.[0]?.streetAddress || ''}
                                    <a href="https://www.google.com/maps/search/?q={encodeURIComponent(address)}" target="_blank" aria-label={$t('contacts.map')}>
                                        <svg><use href="/icons.svg#location-medical" /></svg>
                                    </a>
                                {/if}
                                <div class="-filler"></div>
                            </div>
                            <div class="details">
                                <div class="contacts-info">
                                    {#if contact.performer.institution?.name}
                                        <div class="institution">
                                            <p class="p">{contact.performer.institution.name}</p>
                                            {#if contact.performer.institution.department}
                                                <p class="p">{contact.performer.institution.department}</p>
                                            {/if}
                                        </div>
                                    {/if}

                                    {#if contact.performer.licenseNumber}
                                        <p class="p">{$t('contacts.license')}: {contact.performer.licenseNumber}</p>
                                    {/if}

                                    {#if contact.vcard.tel}
                                        {#each contact.vcard.tel as tel}
                                            {#if tel.value}
                                                <p class="p"><a class="a" href="tel:{tel.value}">{tel.value}</a></p>
                                            {/if}
                                        {/each}
                                    {/if}

                                    {#if contact.vcard.email}
                                        {#each contact.vcard.email as email}
                                            {#if email.value}
                                                <p class="p"><a class="a" href="mailto:{email.value}">{email.value}</a></p>
                                            {/if}
                                        {/each}
                                    {/if}

                                    {#if contact.performer.institution?.address}
                                        <p class="p">{contact.performer.institution.address}</p>
                                    {/if}
                                </div>

                                <div class="card-actions">
                                    <button class="button -small" onclick={() => handleAddToPhone(contact)}>
                                        <svg><use href="/icons.svg#user" /></svg>
                                        {contact.syncedToDevice ? $t('contacts.update-on-phone') : $t('contacts.add-to-phone')}
                                    </button>
                                    <button class="button -small -negative" onclick={() => handleDelete(contact)}>
                                        {$t('contacts.delete')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .page-section {
        padding: var(--ui-pad-medium);
        max-width: 48rem;
        margin: 0 auto;
    }

    .search-bar {
        margin-bottom: var(--ui-pad-medium);
    }

    .search-bar .input {
        width: 100%;
    }

    .empty-state {
        text-align: center;
        color: var(--color-text-secondary);
        padding: var(--ui-pad-xlarge) 0;
    }

    .contacts-list {
        display: flex;
        flex-direction: column;
        gap: var(--gap);
    }

    .card {
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--gap);
        padding: 1rem;
        background-color: var(--color-background);
        cursor: pointer;
        user-select: none;
        width: 100%;
        border: 1px solid var(--color-border);
        text-align: left;
        font: inherit;
        transition: background-color 0.2s ease;
    }

    .card-header:hover {
        background-color: var(--color-background-hover, #f5f5f5);
    }

    .header-info {
        flex: 1;
        min-width: 0;
    }

    .header-info .name {
        font-weight: bold;
        font-size: 1.1rem;
        margin: 0;
    }

    .header-info .role {
        color: var(--color-text-secondary);
        font-size: 0.85rem;
        margin: 0.125rem 0 0;
    }

    .header-info .specialty {
        color: var(--color-text-secondary);
        font-size: 0.8rem;
        margin: 0.125rem 0 0;
    }

    .header-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }

    .sync-badge {
        color: var(--color-positive);
    }

    .sync-badge svg {
        width: 1.25rem;
        height: 1.25rem;
        fill: currentColor;
    }

    .doc-count {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--color-text-secondary);
    }

    .doc-count svg {
        width: 0.9rem;
        height: 0.9rem;
        fill: currentColor;
    }

    .expand-toggle {
        flex-shrink: 0;
        width: 1.5rem;
        height: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary);
    }

    .expand-toggle .chevron {
        width: 100%;
        height: 100%;
        fill: currentColor;
        transition: transform 0.2s ease;
    }

    .card.expanded .expand-toggle .chevron {
        transform: rotate(180deg);
    }

    .card-body {
        display: flex;
        align-items: stretch;
        gap: var(--gap);
        border: 1px solid var(--color-border);
        border-top: none;
    }

    .card .image {
        background-color: var(--color-background);
        padding: 1rem;
        flex-shrink: 0;
        max-width: min(5rem, 20vw);
    }

    .card .actions {
        width: var(--toolbar-height);
        display: flex;
        gap: var(--gap);
        justify-content: stretch;
        align-items: stretch;
    }

    .card .actions.-vertical {
        flex-direction: column;
    }

    .card .actions .-filler {
        flex-grow: 1;
        background-color: var(--color-background);
    }

    .card .actions a {
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

    .card .actions a svg {
        fill: currentColor;
        height: 100%;
        width: 100%;
    }

    .card:hover .actions a {
        background-color: var(--color-white);
    }

    .card:hover .actions a:hover {
        background-color: var(--color-interactivity);
        color: var(--color-interactivity-text);
    }

    .details {
        background-color: var(--color-background);
        flex-grow: 1;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .institution {
        margin-bottom: 0.5rem;
        padding: 0.5rem;
        background-color: var(--color-background-secondary, #f9f9f9);
        border-radius: var(--ui-radius-small);
    }

    .card-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        padding-top: 0.5rem;
        border-top: 1px solid var(--color-border);
    }

    .card-actions .button svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    @media (max-width: 768px) {
        .card-body {
            flex-direction: column;
        }

        .card .image {
            display: none;
        }

        .card .actions.-vertical {
            flex-direction: row;
        }

        .card .actions {
            width: auto;
        }
    }
</style>
