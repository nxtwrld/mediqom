<script lang="ts">
    import { t } from '$lib/i18n';
    import Input from '$components/forms/Input.svelte';
    import Select from '$components/forms/Select.svelte';
    import InputDateTime from '$components/forms/InputDateTime.svelte';
    import ContactForm from '$components/contacts/ContactForm.svelte';
    import type { Appointment } from '$lib/calendar/types.d';
    import { addContact } from '$lib/contacts/store';
    import type { ProviderContact } from '$lib/contacts/types.d';

    interface Props {
        profileId: string;
        onSave: (appointment: Appointment) => void;
        onCancel: () => void;
        saving?: boolean;
    }

    let { profileId, onSave, onCancel, saving = false }: Props = $props();

    let title = $state('');
    let appointmentType = $state('office_visit');
    let dateTime = $state('');
    let duration = $state(30);
    let priority = $state('routine');

    // Provider from ContactForm
    let linkedContact: ProviderContact | undefined = $state(undefined);

    function handleSelectDoctor(contact: ProviderContact) {
        linkedContact = contact;
    }

    async function handleNewDoctor(contact: ProviderContact) {
        await addContact(profileId, contact);
        linkedContact = contact;
    }

    const typeOptions = [
        { key: 'office_visit', value: $t('appointments.form.type-office-visit') },
        { key: 'lab_work', value: $t('appointments.form.type-lab-work') },
        { key: 'imaging', value: $t('appointments.form.type-imaging') },
        { key: 'procedure', value: $t('appointments.form.type-procedure') },
        { key: 'referral', value: $t('appointments.form.type-referral') },
        { key: 'review', value: $t('appointments.form.type-review') },
        { key: 'other', value: $t('appointments.form.type-other') },
    ];

    const priorityOptions = [
        { key: 'immediate', value: $t('appointments.form.priority-immediate') },
        { key: 'urgent', value: $t('appointments.form.priority-urgent') },
        { key: 'routine', value: $t('appointments.form.priority-routine') },
        { key: 'as_needed', value: $t('appointments.form.priority-as-needed') },
    ];

    function handleSubmit(e: Event) {
        e.preventDefault();

        const now = new Date().toISOString();
        const appointment: Appointment = {
            id: crypto.randomUUID(),
            title: title || appointmentType.replace(/_/g, ' '),
            appointmentType,
            status: dateTime ? 'confirmed' : 'suggested',
            priority: priority as Appointment['priority'],
            reminders: [1440, 60],
            createdAt: now,
            updatedAt: now,
            synced: false,
            ...(dateTime && { dateTime }),
            ...(duration && { duration }),
            ...(linkedContact && {
                provider: {
                    name: linkedContact.vcard.fn || '',
                    contactId: linkedContact.id,
                    ...(linkedContact.performer.specialty && { specialty: linkedContact.performer.specialty }),
                    ...(linkedContact.vcard.tel?.[0]?.value && { phone: linkedContact.vcard.tel[0].value }),
                },
            }),
        };

        onSave(appointment);
    }
</script>

<form class="form" onsubmit={handleSubmit}>
    <fieldset>
        <legend>{$t('appointments.form.info')}</legend>

        <Input bind:value={title} label={$t('appointments.form.title')} placeholder={$t('appointments.form.title-placeholder')} />

        <div class="form-row">
            <Select bind:value={appointmentType} label={$t('appointments.form.type')} options={typeOptions} />
            <Select bind:value={priority} label={$t('appointments.form.priority')} options={priorityOptions} />
        </div>

        <div class="form-row">
            <InputDateTime type="date" bind:value={dateTime} label={$t('appointments.form.date')} />
            <Input bind:value={duration} label={$t('appointments.form.duration')} type="number" min="5" max="480" step="5" />
        </div>
    </fieldset>

    <fieldset>
        <legend>{$t('appointments.form.provider')}</legend>
        <ContactForm
            {profileId}
            compact={true}
            onSave={handleNewDoctor}
            onSelect={handleSelectDoctor}
            onCancel={() => {}}
        />
    </fieldset>

    <div class="form-actions">
        <button type="button" class="button" onclick={onCancel}>
            {$t('app.buttons.cancel')}
        </button>
        <button type="submit" class="button -primary" disabled={saving || (!title && !appointmentType)}>
            {saving ? $t('app.buttons.saving') : $t('app.buttons.save')}
        </button>
    </div>
</form>

<style>
    fieldset {
        border: none;
        padding: 0;
        margin: 0 0 var(--ui-pad-large) 0;
    }
    legend {
        font-size: 1.125rem;
        font-weight: 600;
        margin-bottom: var(--ui-pad-medium);
        color: var(--color-text-primary);
    }
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
</style>
