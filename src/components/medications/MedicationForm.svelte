<script lang="ts">
    import { t } from '$lib/i18n';
    import Input from '$components/forms/Input.svelte';
    import Select from '$components/forms/Select.svelte';
    import Textarea from '$components/forms/Textarea.svelte';
    import type { Medication } from '$lib/medications/types';
    import { MEDICATION_FORMS, MEDICATION_ROUTES } from '$lib/medications/types';
    import DrugSearch from './DrugSearch.svelte';
    import ScheduleEditor from './ScheduleEditor.svelte';

    interface Props {
        initialMedication?: Partial<Medication>;
        onSave: (medication: Medication) => void;
        onCancel: () => void;
        saving?: boolean;
    }

    let { initialMedication, onSave, onCancel, saving = false }: Props = $props();

    // Snapshot initial values to break reactivity tracking (intentional one-time copy)
    function initFields() {
        const m = initialMedication;
        return {
            medicationName: m?.medicationName ?? '',
            genericName: m?.genericName ?? '',
            dosage: m?.dosage ?? '',
            strength: m?.strength ?? '',
            form: m?.form ?? 'tablet',
            route: m?.route ?? 'oral',
            indication: m?.indication ?? '',
            prescriber: m?.prescriber ?? '',
            notes: m?.notes ?? '',
            frequency: m?.schedule?.frequency ?? 'daily',
            times: m?.schedule?.times ?? ['08:00'],
            byDay: m?.schedule?.byDay ?? [],
            byMonthDay: m?.schedule?.byMonthDay ?? [],
            startDate: m?.schedule?.startDate ?? new Date().toISOString().split('T')[0],
            endDate: m?.schedule?.endDate ?? '',
            pillCount: m?.schedule?.pillCount ?? 0,
        };
    }
    const init = initFields();

    // Medication fields
    let medicationName = $state(init.medicationName);
    let genericName = $state(init.genericName);
    let dosage = $state(init.dosage);
    let strength = $state(init.strength);
    let form = $state(init.form);
    let route = $state(init.route);
    let indication = $state(init.indication);
    let prescriber = $state(init.prescriber);
    let notes = $state(init.notes);

    // Schedule fields
    let frequency = $state(init.frequency);
    let times = $state<string[]>(init.times);
    let byDay = $state<string[]>(init.byDay);
    let byMonthDay = $state<number[]>(init.byMonthDay);
    let startDate = $state(init.startDate);
    let endDate = $state(init.endDate);
    let pillCount = $state(init.pillCount);

    function handleDrugSelect(drug: { title: string; dosage?: string; route?: string; form?: string }) {
        medicationName = drug.title;
        if (drug.dosage) dosage = drug.dosage;
        if (drug.route) route = drug.route as any;
        if (drug.form) form = drug.form.toLowerCase() as any;
    }

    function handleSubmit(e: Event) {
        e.preventDefault();

        const medication: Medication = {
            medicationName,
            dosage,
            form: form as any,
            route: route as any,
            status: initialMedication?.status ?? 'active',
            schedule: {
                frequency: frequency as any,
                times,
                startDate,
                ...(byDay.length > 0 && { byDay }),
                ...(byMonthDay.length > 0 && { byMonthDay }),
                ...(endDate && { endDate }),
                ...(pillCount > 0 && { pillCount }),
            },
            adherence: initialMedication?.adherence ?? { confirmations: [] },
            ...(genericName && { genericName }),
            ...(strength && { strength }),
            ...(indication && { indication }),
            ...(prescriber && { prescriber }),
            ...(notes && { notes }),
            ...(initialMedication?.sourceDocumentId && { sourceDocumentId: initialMedication.sourceDocumentId }),
            ...(initialMedication?.brandName && { brandName: initialMedication.brandName }),
            ...(initialMedication?.therapeuticClass && { therapeuticClass: initialMedication.therapeuticClass }),
            ...(initialMedication?.searchTerms && { searchTerms: initialMedication.searchTerms }),
            ...(initialMedication?.prescriptionDate && { prescriptionDate: initialMedication.prescriptionDate }),
            ...(initialMedication?.lastFilled && { lastFilled: initialMedication.lastFilled }),
            ...(initialMedication?.adherenceLevel && { adherenceLevel: initialMedication.adherenceLevel }),
            ...(initialMedication?.sideEffects && { sideEffects: initialMedication.sideEffects }),
            ...(initialMedication?.instructions && { instructions: initialMedication.instructions }),
            ...(initialMedication?.duration && { duration: initialMedication.duration }),
        };

        onSave(medication);
    }
</script>

<form class="form medication-form" onsubmit={handleSubmit}>
    <fieldset>
        <legend>{$t('medications.medication-info')}</legend>

        <DrugSearch bind:value={medicationName} onSelect={handleDrugSelect} />

        <Input bind:value={genericName} label={$t('medications.generic-name')} placeholder="" />

        <div class="form-row">
            <Input bind:value={dosage} label={$t('medications.dosage')} placeholder="e.g. 500mg" required />
            <Input bind:value={strength} label={$t('medications.strength')} placeholder="" />
        </div>

        <div class="form-row">
            <div class="select-with-icon">
                <svg class="select-icon" aria-hidden="true"><use href="/icons.svg#form-{form}"></use></svg>
                <Select bind:value={form} label={$t('medications.form')} options={MEDICATION_FORMS.map(f => ({ key: f, value: $t(`medications.form-${f}`) }))} />
            </div>
            <Select bind:value={route} label={$t('medications.route')} options={MEDICATION_ROUTES.map(r => ({ key: r, value: $t(`medications.route-${r}`) }))} />
        </div>

        <Input bind:value={indication} label={$t('medications.indication')} placeholder="" />
        <Input bind:value={prescriber} label={$t('medications.prescriber')} placeholder="" />
        <Textarea bind:value={notes} label={$t('medications.notes')} placeholder="" />
    </fieldset>

    <fieldset>
        <legend>{$t('medications.schedule')}</legend>
        <ScheduleEditor
            bind:frequency
            bind:times
            bind:byDay
            bind:byMonthDay
            bind:startDate
            bind:endDate
            bind:pillCount
        />
    </fieldset>

    <div class="form-actions">
        <button type="button" class="button" onclick={onCancel}>
            {$t('app.buttons.cancel')}
        </button>
        <button type="submit" class="button -primary" disabled={saving || !medicationName || !dosage}>
            {saving ? $t('app.buttons.saving') : $t('app.buttons.save')}
        </button>
    </div>
</form>

<style>
    .medication-form {
        max-width: 40rem;
    }
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
    .select-with-icon {
        display: flex;
        align-items: flex-end;
        gap: var(--ui-pad-small);
    }
    .select-with-icon .select-icon {
        width: 1.5rem;
        height: 1.5rem;
        fill: var(--color-text-secondary);
        flex-shrink: 0;
        margin-bottom: 0.5rem;
    }
    .form-actions {
        display: flex;
        gap: var(--ui-pad-small);
        justify-content: flex-end;
        padding-top: var(--ui-pad-medium);
        border-top: 1px solid var(--color-border);
    }
</style>
