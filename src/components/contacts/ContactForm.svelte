<script lang="ts">
    import { t } from '$lib/i18n';
    import Input from '$components/forms/Input.svelte';
    import Select from '$components/forms/Select.svelte';
    import { getContacts } from '$lib/contacts/store';
    import type { ProviderContact } from '$lib/contacts/types.d';

    interface Props {
        profileId: string;
        onSave: (contact: ProviderContact) => void;
        onSelect?: (contact: ProviderContact) => void;
        onCancel: () => void;
        saving?: boolean;
        compact?: boolean;
    }

    let { profileId, onSave, onSelect, onCancel, saving = false, compact = false }: Props = $props();

    // Form fields
    let name = $state('');
    let role = $state('primary_physician');
    let specialty = $state('');
    let phone = $state('');
    let email = $state('');
    let institution = $state('');
    let department = $state('');
    let address = $state('');
    let licenseNumber = $state('');

    // Typeahead state
    let selectedContact: ProviderContact | undefined = $state(undefined);
    let showSuggestions = $state(false);
    let selectedIndex = $state(-1);

    // Progressive disclosure
    let showInstitution = $state(false);
    let showDetails = $state(false);

    const contacts = $derived(getContacts(profileId));
    const filteredContacts = $derived(
        name.trim().length > 0
            ? contacts.filter((c) =>
                  c.vcard.fn?.toLowerCase().includes(name.trim().toLowerCase()),
              )
            : [],
    );

    const roleOptions = [
        { key: 'primary_physician', value: $t('contacts.form.role-primary') },
        { key: 'specialist', value: $t('contacts.form.role-specialist') },
        { key: 'surgeon', value: $t('contacts.form.role-surgeon') },
        { key: 'dentist', value: $t('contacts.form.role-dentist') },
        { key: 'therapist', value: $t('contacts.form.role-therapist') },
        { key: 'radiologist', value: $t('contacts.form.role-radiologist') },
        { key: 'pharmacist', value: $t('contacts.form.role-pharmacist') },
        { key: 'other_specialist', value: $t('contacts.form.role-other') },
    ];

    function handleNameInput() {
        selectedIndex = -1;
        showSuggestions = filteredContacts.length > 0;
    }

    function handleNameFocus() {
        if (filteredContacts.length > 0) showSuggestions = true;
    }

    function handleNameBlur() {
        setTimeout(() => { showSuggestions = false; }, 200);
    }

    function handleNameKeydown(e: KeyboardEvent) {
        if (!showSuggestions || filteredContacts.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, filteredContacts.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectExisting(filteredContacts[selectedIndex]);
        } else if (e.key === 'Escape') {
            showSuggestions = false;
        }
    }

    function selectExisting(contact: ProviderContact) {
        selectedContact = contact;
        name = contact.vcard.fn || '';
        showSuggestions = false;
        onSelect?.(contact);
    }

    function clearSelection() {
        selectedContact = undefined;
        name = '';
    }

    function handleSubmit(e: Event) {
        e.preventDefault();
        if (selectedContact) {
            onSelect?.(selectedContact);
            return;
        }

        const now = new Date().toISOString();
        const contact: ProviderContact = {
            id: crypto.randomUUID(),
            vcard: {
                fn: name,
                ...(phone && { tel: [{ type: 'work', value: phone }] }),
                ...(email && { email: [{ type: 'work', value: email }] }),
                ...(institution && { org: institution }),
                ...(specialty && { specialty: [specialty] }),
                ...(address && { adr: [{ streetAddress: address }] }),
            },
            performer: {
                role,
                ...(specialty && { specialty }),
                ...(licenseNumber && { licenseNumber }),
                ...((institution || department || address) && {
                    institution: {
                        ...(institution && { name: institution }),
                        ...(department && { department }),
                        ...(address && { address }),
                        ...(phone && { phone }),
                        ...(email && { email }),
                    },
                }),
            },
            sourceDocuments: [],
            createdAt: now,
            updatedAt: now,
            userEdited: true,
            syncedToDevice: false,
        };

        onSave(contact);
    }
</script>

<svelte:element this={compact ? 'div' : 'form'} class="form" onsubmit={compact ? undefined : handleSubmit}>
    {#if selectedContact}
        <div class="selected-contact">
            <p class="contact-name">{selectedContact.vcard.fn}</p>
            {#if selectedContact.performer.specialty}
                <p class="contact-detail">{selectedContact.performer.specialty}</p>
            {/if}
            {#if selectedContact.performer.institution?.name}
                <p class="contact-detail">{selectedContact.performer.institution.name}</p>
            {/if}
            {#if selectedContact.vcard.tel?.[0]?.value}
                <p class="contact-detail">{selectedContact.vcard.tel[0].value}</p>
            {/if}
            <button type="button" class="button -small" onclick={clearSelection}>
                {$t('contacts.form.change')}
            </button>
        </div>
    {:else}
        <div class="provider-search">
            <label class="label" for="contact-name">{$t('contacts.form.name')}</label>
            <input
                id="contact-name"
                type="text"
                class="input"
                bind:value={name}
                oninput={handleNameInput}
                onkeydown={handleNameKeydown}
                onblur={handleNameBlur}
                onfocus={handleNameFocus}
                placeholder={$t('appointments.select-doctor')}
                autocomplete="off"
                required
            />
            {#if showSuggestions && filteredContacts.length > 0}
                <ul class="search-results" role="listbox">
                    {#each filteredContacts as contact, i}
                        <li
                            role="option"
                            class:selected={i === selectedIndex}
                            aria-selected={i === selectedIndex}
                            onmousedown={() => selectExisting(contact)}
                        >
                            <span class="result-name">{contact.vcard.fn}</span>
                            {#if contact.performer.specialty}
                                <span class="result-detail">{contact.performer.specialty}</span>
                            {/if}
                            {#if contact.performer.institution?.name}
                                <span class="result-detail">{contact.performer.institution.name}</span>
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <div class="form-row">
            <Select bind:value={role} label={$t('contacts.form.role')} options={roleOptions} />
            <Input bind:value={specialty} label={$t('contacts.form.specialty')} />
        </div>

        <Input bind:value={phone} label={$t('contacts.form.phone')} type="tel" />

        {#if showDetails}
            <div class="form-row">
                <Input bind:value={email} label={$t('contacts.form.email')} type="email" />
                <Input bind:value={licenseNumber} label={$t('contacts.form.license')} />
            </div>
        {:else}
            <button type="button" class="expand-toggle" onclick={() => showDetails = true}>
                + {$t('contacts.form.add-details')}
            </button>
        {/if}

        {#if showInstitution}
            <Input bind:value={institution} label={$t('contacts.form.institution-name')} />
            <div class="form-row">
                <Input bind:value={department} label={$t('contacts.form.department')} />
                <Input bind:value={address} label={$t('contacts.form.address')} />
            </div>
        {:else}
            <button type="button" class="expand-toggle" onclick={() => showInstitution = true}>
                + {$t('contacts.form.add-institution')}
            </button>
        {/if}
    {/if}

    {#if !compact && !selectedContact}
        <div class="form-actions">
            <button type="button" class="button" onclick={onCancel}>
                {$t('app.buttons.cancel')}
            </button>
            <button type="submit" class="button -primary" disabled={saving || !name}>
                {saving ? $t('app.buttons.saving') : $t('app.buttons.save')}
            </button>
        </div>
    {/if}
</svelte:element>

<style>
    .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ui-pad-medium);
    }
    .form-actions {
        display: flex;
        gap: var(--ui-pad-small);
        justify-content: flex-end;
        padding-top: var(--ui-pad-medium);
        border-top: 1px solid var(--color-border);
    }
    .selected-contact {
        padding: var(--ui-pad-small);
        background: var(--color-background);
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-small);
    }
    .contact-name {
        font-weight: 600;
        margin: 0;
    }
    .contact-detail {
        color: var(--color-text-secondary);
        font-size: 0.85rem;
        margin: 0.125rem 0 0;
    }
    .selected-contact .button {
        margin-top: var(--ui-pad-small);
    }
    .provider-search {
        position: relative;
    }
    .search-results {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--color-white);
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-small);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        max-height: 16rem;
        overflow-y: auto;
        z-index: 100;
        list-style: none;
        margin: 0.25rem 0 0;
        padding: 0;
    }
    .search-results li {
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 0.5rem;
        align-items: baseline;
    }
    .search-results li:hover,
    .search-results li.selected {
        background: var(--color-gray-300);
    }
    .result-name {
        font-weight: 500;
    }
    .result-detail {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
    }
    .expand-toggle {
        background: none;
        border: none;
        color: var(--color-interactivity);
        cursor: pointer;
        font-size: 0.85rem;
        padding: var(--ui-pad-small) 0;
        text-align: left;
    }
    .expand-toggle:hover {
        text-decoration: underline;
    }
</style>
