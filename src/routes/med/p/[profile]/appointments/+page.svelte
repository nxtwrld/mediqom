<script lang="ts">
    import { profile } from '$lib/profiles';
    import { t } from '$lib/i18n';
    import {
        appointmentsByProfile,
        confirmAppointment,
        dismissAppointment,
        addAppointment,
        updateAppointment,
    } from '$lib/calendar/store';
    import { downloadICS, downloadAllICS } from '$lib/calendar/ics-export';
    import type { Appointment } from '$lib/calendar/types.d';
    import { getContacts, addContact } from '$lib/contacts/store';
    import type { ProviderContact } from '$lib/contacts/types.d';
    import Empty from '$components/ui/Empty.svelte';
    import InputDateTime from '$components/forms/InputDateTime.svelte';
    import Modal from '$components/ui/Modal.svelte';
    import AppointmentForm from '$components/appointments/AppointmentForm.svelte';

    const appointments = $derived($profile?.id ? appointmentsByProfile($profile.id) : undefined);

    // Group appointments by status
    let suggested = $derived(
        ($appointments || []).filter((a: Appointment) => a.status === 'suggested'),
    );
    let upcoming = $derived(
        ($appointments || [])
            .filter((a: Appointment) => a.status === 'confirmed' && a.dateTime)
            .sort((a: Appointment, b: Appointment) => (a.dateTime || '').localeCompare(b.dateTime || '')),
    );
    let past = $derived(
        ($appointments || []).filter((a: Appointment) => a.status === 'completed'),
    );
    let exportable = $derived(
        ($appointments || []).filter((a: Appointment) => a.status !== 'dismissed' && a.dateTime),
    );

    let showAddModal = $state(false);
    let saving = $state(false);
    let confirmingId: string | null = $state(null);
    let confirmDate = $state('');
    let linkingId: string | null = $state(null);
    let linkQuery = $state('');
    let linkShowSuggestions = $state(false);
    let linkSelectedIndex = $state(-1);

    const contacts = $derived($profile?.id ? getContacts($profile.id) : []);

    const filteredLinkContacts = $derived(
        linkQuery.trim().length > 0
            ? contacts.filter((c) =>
                  c.vcard.fn?.toLowerCase().includes(linkQuery.trim().toLowerCase()),
              )
            : contacts,
    );

    function getContactName(contactId: string): string | undefined {
        return contacts.find((c) => c.id === contactId)?.vcard.fn;
    }

    function startConfirm(id: string) {
        confirmingId = id;
        confirmDate = '';
    }

    async function handleConfirm(appointmentId: string) {
        if (!confirmDate || !$profile?.id) return;
        await confirmAppointment($profile.id, appointmentId, confirmDate);
        confirmingId = null;
    }

    async function handleDismiss(appointmentId: string) {
        if (!$profile?.id) return;
        await dismissAppointment($profile.id, appointmentId);
    }

    function startLink(id: string) {
        linkingId = id;
        linkQuery = '';
        linkShowSuggestions = true;
        linkSelectedIndex = -1;
    }

    async function linkToContact(appointmentId: string, contact: ProviderContact) {
        if (!$profile?.id) return;
        await updateAppointment($profile.id, appointmentId, {
            provider: {
                name: contact.vcard.fn || '',
                contactId: contact.id,
                ...(contact.performer.specialty && { specialty: contact.performer.specialty }),
                ...(contact.vcard.tel?.[0]?.value && { phone: contact.vcard.tel[0].value }),
            },
        });
        linkingId = null;
    }

    function handleLinkInput() {
        linkSelectedIndex = -1;
        linkShowSuggestions = true;
    }

    function handleLinkKeydown(e: KeyboardEvent, appointmentId: string) {
        if (!linkShowSuggestions || filteredLinkContacts.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            linkSelectedIndex = Math.min(linkSelectedIndex + 1, filteredLinkContacts.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            linkSelectedIndex = Math.max(linkSelectedIndex - 1, 0);
        } else if (e.key === 'Enter' && linkSelectedIndex >= 0) {
            e.preventDefault();
            linkToContact(appointmentId, filteredLinkContacts[linkSelectedIndex]);
        } else if (e.key === 'Escape') {
            linkingId = null;
        }
    }

    function handleLinkBlur() {
        setTimeout(() => { linkShowSuggestions = false; }, 200);
    }

    async function handleSaveAsDoctor(appointment: Appointment) {
        if (!$profile?.id || !appointment.provider?.name) return;
        const now = new Date().toISOString();
        const newContact: ProviderContact = {
            id: crypto.randomUUID(),
            vcard: {
                fn: appointment.provider.name,
                ...(appointment.provider.phone && { tel: [{ type: 'work', value: appointment.provider.phone }] }),
            },
            performer: {
                role: 'specialist',
                ...(appointment.provider.specialty && { specialty: appointment.provider.specialty }),
            },
            sourceDocuments: [],
            createdAt: now,
            updatedAt: now,
            userEdited: false,
            syncedToDevice: false,
        };
        await addContact($profile.id, newContact);
        await updateAppointment($profile.id, appointment.id, {
            provider: {
                ...appointment.provider,
                contactId: newContact.id,
            },
        });
    }

    function handleExportSingle(appointment: Appointment) {
        downloadICS(appointment);
    }

    async function handleAddAppointment(appointment: Appointment) {
        if (!$profile?.id) return;
        saving = true;
        try {
            await addAppointment($profile.id, appointment);
            showAddModal = false;
        } finally {
            saving = false;
        }
    }

    function handleExportAll() {
        downloadAllICS(exportable);
    }

    function formatPriority(priority: string): string {
        return priority.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    }

    function formatDate(iso?: string): string {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch {
            return iso;
        }
    }
</script>

<div class="page -empty">
    <div class="heading">
        <h2 class="h2">{$t('appointments.title')}</h2>
        <div class="heading-actions">
            {#if exportable.length > 0}
                <button class="button -small" onclick={handleExportAll}>
                    <svg><use href="/icons.svg#download" /></svg>
                    {$t('appointments.export-all')}
                </button>
            {/if}
            <button type="button" class="button -primary -small" onclick={() => showAddModal = true}>
                {$t('appointments.add')}
            </button>
        </div>
    </div>

    {#if suggested.length === 0 && upcoming.length === 0 && past.length === 0}
        <Empty>{$t('appointments.empty')}</Empty>
    {/if}

    {#if suggested.length > 0}
        <section class="appointment-section">
            <h3 class="h3">{$t('appointments.needs-action')}</h3>
            {#each suggested as appointment (appointment.id)}
                <div class="appointment-card -suggested">
                    <div class="appointment-info">
                        <p class="appointment-title">{appointment.title}</p>
                        {#if appointment.timeframe}
                            <p class="timeframe">{appointment.timeframe}</p>
                        {/if}
                        {#if appointment.provider?.contactId}
                            <p class="provider -linked">{getContactName(appointment.provider.contactId) || appointment.provider.name}</p>
                        {:else if appointment.provider?.name}
                            <p class="provider">{appointment.provider.name}</p>
                        {/if}
                        <span class="priority -priority-{appointment.priority}">{formatPriority(appointment.priority)}</span>
                    </div>
                    <div class="appointment-actions">
                        {#if confirmingId === appointment.id}
                            <div class="confirm-form">
                                <InputDateTime type="date" bind:value={confirmDate} />
                                <button class="button -small -primary" onclick={() => handleConfirm(appointment.id)}>
                                    {$t('appointments.save')}
                                </button>
                                <button class="button -small" onclick={() => (confirmingId = null)}>
                                    {$t('appointments.cancel')}
                                </button>
                            </div>
                        {:else if linkingId === appointment.id}
                            <div class="link-form">
                                <input
                                    type="text"
                                    class="input"
                                    bind:value={linkQuery}
                                    oninput={handleLinkInput}
                                    onkeydown={(e) => handleLinkKeydown(e, appointment.id)}
                                    onblur={handleLinkBlur}
                                    onfocus={() => { linkShowSuggestions = true; }}
                                    placeholder={$t('appointments.select-doctor')}
                                    autocomplete="off"
                                />
                                {#if linkShowSuggestions && filteredLinkContacts.length > 0}
                                    <ul class="search-results" role="listbox">
                                        {#each filteredLinkContacts as contact, i}
                                            <li
                                                role="option"
                                                class:selected={i === linkSelectedIndex}
                                                aria-selected={i === linkSelectedIndex}
                                                onmousedown={() => linkToContact(appointment.id, contact)}
                                            >
                                                <span class="result-name">{contact.vcard.fn}</span>
                                                {#if contact.performer.specialty}
                                                    <span class="result-detail">{contact.performer.specialty}</span>
                                                {/if}
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}
                                <button class="button -small" onclick={() => (linkingId = null)}>
                                    {$t('appointments.cancel')}
                                </button>
                            </div>
                        {:else}
                            <button class="button -small -primary" onclick={() => startConfirm(appointment.id)}>
                                {$t('appointments.set-date')}
                            </button>
                            {#if appointment.provider?.name && !appointment.provider.contactId && contacts.length > 0}
                                <button class="button -small" onclick={() => startLink(appointment.id)}>
                                    {$t('appointments.link-doctor')}
                                </button>
                            {:else if appointment.provider?.name && !appointment.provider.contactId}
                                <button class="button -small" onclick={() => handleSaveAsDoctor(appointment)}>
                                    {$t('appointments.save-as-doctor')}
                                </button>
                            {/if}
                            <button class="button -small -negative" onclick={() => handleDismiss(appointment.id)}>
                                {$t('appointments.dismiss')}
                            </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </section>
    {/if}

    {#if upcoming.length > 0}
        <section class="appointment-section">
            <h3 class="h3">{$t('appointments.upcoming')}</h3>
            {#each upcoming as appointment (appointment.id)}
                <div class="appointment-card -confirmed">
                    <div class="appointment-info">
                        <p class="appointment-title">{appointment.title}</p>
                        <p class="date">{formatDate(appointment.dateTime)}</p>
                        {#if appointment.provider?.contactId}
                            <p class="provider -linked">{getContactName(appointment.provider.contactId) || appointment.provider.name}</p>
                        {:else if appointment.provider?.name}
                            <p class="provider">{appointment.provider.name}</p>
                        {/if}
                        {#if appointment.synced}
                            <span class="sync-indicator" title={$t('appointments.synced')}>
                                <svg><use href="/icons-o.svg#checked" /></svg>
                                {$t('appointments.synced')}
                            </span>
                        {/if}
                    </div>
                    <div class="appointment-actions">
                        {#if linkingId === appointment.id}
                            <div class="link-form">
                                <input
                                    type="text"
                                    class="input"
                                    bind:value={linkQuery}
                                    oninput={handleLinkInput}
                                    onkeydown={(e) => handleLinkKeydown(e, appointment.id)}
                                    onblur={handleLinkBlur}
                                    onfocus={() => { linkShowSuggestions = true; }}
                                    placeholder={$t('appointments.select-doctor')}
                                    autocomplete="off"
                                />
                                {#if linkShowSuggestions && filteredLinkContacts.length > 0}
                                    <ul class="search-results" role="listbox">
                                        {#each filteredLinkContacts as contact, i}
                                            <li
                                                role="option"
                                                class:selected={i === linkSelectedIndex}
                                                aria-selected={i === linkSelectedIndex}
                                                onmousedown={() => linkToContact(appointment.id, contact)}
                                            >
                                                <span class="result-name">{contact.vcard.fn}</span>
                                                {#if contact.performer.specialty}
                                                    <span class="result-detail">{contact.performer.specialty}</span>
                                                {/if}
                                            </li>
                                        {/each}
                                    </ul>
                                {/if}
                                <button class="button -small" onclick={() => (linkingId = null)}>
                                    {$t('appointments.cancel')}
                                </button>
                            </div>
                        {:else}
                            {#if appointment.provider?.name && !appointment.provider.contactId && contacts.length > 0}
                                <button class="button -small" onclick={() => startLink(appointment.id)}>
                                    {$t('appointments.link-doctor')}
                                </button>
                            {:else if appointment.provider?.name && !appointment.provider.contactId}
                                <button class="button -small" onclick={() => handleSaveAsDoctor(appointment)}>
                                    {$t('appointments.save-as-doctor')}
                                </button>
                            {/if}
                            <button class="button -small" onclick={() => handleExportSingle(appointment)}>
                                <svg><use href="/icons.svg#download" /></svg>
                                {$t('appointments.export')}
                            </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </section>
    {/if}

    {#if past.length > 0}
        <section class="appointment-section">
            <h3 class="h3">{$t('appointments.past')}</h3>
            {#each past as appointment (appointment.id)}
                <div class="appointment-card -past">
                    <div class="appointment-info">
                        <p class="appointment-title">{appointment.title}</p>
                        <p class="date">{formatDate(appointment.dateTime)}</p>
                        {#if appointment.provider?.contactId}
                            <p class="provider -linked">{getContactName(appointment.provider.contactId) || appointment.provider.name}</p>
                        {:else if appointment.provider?.name}
                            <p class="provider">{appointment.provider.name}</p>
                        {/if}
                    </div>
                </div>
            {/each}
        </section>
    {/if}
</div>

{#if showAddModal}
    <Modal onclose={() => { showAddModal = false; }}>
        <AppointmentForm
            profileId={$profile?.id || ''}
            onSave={handleAddAppointment}
            onCancel={() => showAddModal = false}
            {saving}
        />
    </Modal>
{/if}

<style>
    .heading-actions {
        display: flex;
        gap: var(--ui-pad-small);
        align-items: center;
    }

    .heading-actions .button svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    .appointment-section {
        margin-bottom: var(--ui-pad-large);
    }

    .appointment-section .h3 {
        margin-bottom: 0.75rem;
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .appointment-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--gap);
        padding: var(--ui-pad-medium);
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-small);
        margin-bottom: var(--ui-pad-small);
        background: var(--color-background);
    }

    .appointment-card.-suggested {
        border-left: 3px solid var(--color-warning);
    }

    .appointment-card.-confirmed {
        border-left: 3px solid var(--color-positive);
    }

    .appointment-card.-past {
        opacity: 0.7;
    }

    .appointment-info {
        flex: 1;
        min-width: 0;
    }

    .appointment-title {
        font-weight: 600;
        margin: 0;
    }

    .date {
        color: var(--color-text-primary);
        font-size: 0.9rem;
        margin: 0.25rem 0 0;
    }

    .timeframe {
        color: var(--color-warning);
        font-size: 0.9rem;
        font-style: italic;
        margin: 0.25rem 0 0;
    }

    .provider {
        color: var(--color-text-secondary);
        font-size: 0.85rem;
        margin: 0.25rem 0 0;
    }

    .provider.-linked {
        color: var(--color-interactivity);
        font-weight: 500;
    }

    .priority {
        display: inline-block;
        font-size: 0.7rem;
        padding: 0.125rem 0.4rem;
        border-radius: var(--ui-radius-small);
        margin-top: 0.25rem;
    }

    .-priority-immediate {
        background: var(--color-negative);
        color: white;
    }

    .-priority-urgent {
        background: var(--color-warning);
        color: white;
    }

    .-priority-routine {
        background: var(--color-border);
        color: var(--color-text-primary);
    }

    .sync-indicator {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--color-positive);
        margin-top: 0.25rem;
    }

    .sync-indicator svg {
        width: 0.9rem;
        height: 0.9rem;
        fill: currentColor;
    }

    .appointment-actions {
        flex-shrink: 0;
        display: flex;
        gap: var(--ui-pad-small);
        align-items: center;
    }

    .appointment-actions .button svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    .confirm-form {
        display: flex;
        gap: var(--ui-pad-small);
        align-items: center;
    }

    .link-form {
        position: relative;
        display: flex;
        gap: var(--ui-pad-small);
        align-items: center;
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
        background: var(--color-background-hover);
    }

    .result-name {
        font-weight: 500;
    }

    .result-detail {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
    }

    @media (max-width: 768px) {
        .appointment-card {
            flex-direction: column;
            align-items: flex-start;
        }

        .appointment-actions {
            width: 100%;
        }

        .confirm-form {
            flex-wrap: wrap;
        }
    }
</style>
