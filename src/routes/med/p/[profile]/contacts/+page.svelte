<script lang="ts">
    import { profile } from '$lib/profiles';
    import { t } from '$lib/i18n';
    import { contactsByProfile, removeContact, markContactSynced, addContact } from '$lib/contacts/store';
    import { downloadVCard } from '$lib/contacts/vcard-export';
    import { isNativePlatform } from '$lib/config/platform';
    import { confirm } from '$lib/ui';
    import { get } from 'svelte/store';
    import { _ } from '$lib/i18n';
    import type { ProviderContact } from '$lib/contacts/types.d';
    import Empty from '$components/ui/Empty.svelte';
    import Input from '$components/forms/Input.svelte';
    import Modal from '$components/ui/Modal.svelte';
    import ContactForm from '$components/contacts/ContactForm.svelte';
    import ContactCard from '$components/contacts/ContactCard.svelte';
    import ContactActions from '$components/contacts/ContactActions.svelte';
    import ContactDetails from '$components/contacts/ContactDetails.svelte';

    let search = $state('');
    let showAddModal = $state(false);
    let saving = $state(false);
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

    async function handleAddToPhone(contact: ProviderContact) {
        if (isNativePlatform()) {
            downloadVCard(contact);
        } else {
            downloadVCard(contact);
        }
        if ($profile?.id) {
            await markContactSynced($profile.id, contact.id);
        }
    }

    async function handleAddContact(contact: ProviderContact) {
        if (!$profile?.id) return;
        saving = true;
        try {
            await addContact($profile.id, contact);
            showAddModal = false;
        } finally {
            saving = false;
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

<div class="page -empty">
    <div class="heading">
        <h2 class="h2">{$t('contacts.title')}</h2>
        <Input type="search" bind:value={search} placeholder={$t('contacts.search-placeholder')} />
        <div class="toolbar">
            <button type="button" onclick={() => showAddModal = true}>
                {$t('contacts.add')}
            </button>
        </div>
    </div>

    {#if filtered.length === 0}
        <Empty>{$t('contacts.empty')}</Empty>
    {:else}
        <div class="contacts-list">
            {#each filtered as contact (contact.id)}
                <ContactCard
                    name={contact.vcard.fn || 'Unknown'}
                    role={contact.performer.role}
                    specialty={contact.performer.specialty}
                    expanded={expandedId === contact.id}
                    ontoggle={() => toggleExpand(contact.id)}
                >
                    {#snippet headerExtras()}
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
                    {/snippet}
                    <ContactActions
                        phone={contact.vcard.tel?.[0]?.value}
                        email={contact.vcard.email?.[0]?.value}
                        address={contact.performer.institution?.address || contact.vcard.adr?.[0]?.streetAddress}
                    />
                    <ContactDetails
                        licenseNumber={contact.performer.licenseNumber}
                        institution={contact.performer.institution}
                        phones={contact.vcard.tel?.map((t: any) => t.value).filter(Boolean)}
                        emails={contact.vcard.email?.map((e: any) => e.value).filter(Boolean)}
                        address={contact.performer.institution?.address}
                    >
                        {#snippet footerActions()}
                            <button class="button -small" onclick={() => handleAddToPhone(contact)}>
                                <svg class="btn-icon"><use href="/icons.svg#user" /></svg>
                                {contact.syncedToDevice ? $t('contacts.update-on-phone') : $t('contacts.add-to-phone')}
                            </button>
                            <button class="button -small -negative" onclick={() => handleDelete(contact)}>
                                {$t('contacts.delete')}
                            </button>
                        {/snippet}
                    </ContactDetails>
                </ContactCard>
            {/each}
        </div>
    {/if}
</div>

{#if showAddModal}
    <Modal onclose={() => { showAddModal = false; }}>
        <ContactForm
            profileId={$profile?.id || ''}
            onSave={handleAddContact}
            onSelect={(contact) => { showAddModal = false; }}
            onCancel={() => showAddModal = false}
            {saving}
        />
    </Modal>
{/if}

<style>
    .contacts-list {
        display: flex;
        flex-direction: column;
        gap: var(--gap);
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

    .btn-icon {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }
</style>
