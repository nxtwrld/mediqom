<script lang="ts">
    import { t } from '$lib/i18n';
    import type { MedicationDocument, Medication } from '$lib/medications/types';
    import { formatSchedule } from '$lib/medications/store';

    interface Props {
        medication?: MedicationDocument;
        extracted?: Partial<Medication>;
        profileId: string;
    }

    let { medication, extracted, profileId }: Props = $props();

    const isExtracted = $derived(!!extracted?.sourceDocumentId);
    const med = $derived(extracted || medication?.content.medication);
    const schedule = $derived(medication?.content.medication?.schedule);
    const status = $derived(medication?.content.status);

    const displayDate = $derived.by(() => {
        const raw = isExtracted
            ? (extracted?.prescriptionDate || extracted?.sourceDocumentDate)
            : medication?.content.medication?.schedule?.startDate;
        if (!raw) return null;
        try { return new Date(raw).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
        catch { return raw; }
    });

    const href = $derived(
        isExtracted
            ? `/med/p/${profileId}/documents/${extracted!.sourceDocumentId}`
            : `/med/p/${profileId}/medications/${medication!.id}`
    );
</script>

<a {href} class="medication-card" class:-extracted={isExtracted}>
    <div class="card-header">
        <h3 class="card-title">{med?.medicationName ?? ''}</h3>
        {#if isExtracted}
            <span class="source-badge" title={$t('medications.from-document')}>
                <svg class="badge-icon" aria-hidden="true"><use href="/icons.svg#document"></use></svg>
            </span>
        {:else if status}
            <span class="status-dot -{status}" title={$t(`medications.status-${status}`)}></span>
        {/if}
    </div>
    {#if med?.dosage}
        <div class="card-dosage">{med.dosage}</div>
    {/if}
    <div class="card-meta">
        {#if med?.form}
            <span class="card-form">
                <svg class="meta-icon" aria-hidden="true"><use href="/icons.svg#form-{med.form}"></use></svg>
                {$t(`medications.form-${med.form}`)}
            </span>
        {/if}
        {#if schedule && !isExtracted}
            <span class="card-schedule">
                <svg class="meta-icon" aria-hidden="true"><use href="/icons.svg#frequency-{schedule.frequency}"></use></svg>
                {formatSchedule(schedule, $t)}
            </span>
        {/if}
        {#if displayDate}
            <span class="card-date">{displayDate}</span>
        {/if}
    </div>
    {#if schedule && !isExtracted && schedule.times.length > 0 && schedule.frequency !== 'as_needed'}
        <div class="card-times">
            {#each schedule.times as time}
                <span class="time-badge">{time}</span>
            {/each}
        </div>
    {/if}
</a>

<style>
    .medication-card {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        padding: var(--ui-pad-medium);
        background: var(--color-surface, var(--color-white));
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-medium);
        text-decoration: none;
        color: inherit;
        transition: box-shadow 0.15s ease;
    }
    .medication-card:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .medication-card.-extracted {
        border-style: dashed;
    }
    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .card-title {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
    }
    .status-dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .status-dot.-active { background: var(--color-positive); }
    .status-dot.-paused { background: var(--color-warning); }
    .status-dot.-completed { background: var(--color-text-secondary); }
    .status-dot.-discontinued { background: var(--color-negative); }
    .source-badge {
        display: flex;
        align-items: center;
        color: var(--color-text-secondary);
    }
    .badge-icon {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }
    .card-dosage {
        font-size: 0.9375rem;
        color: var(--color-text-primary);
    }
    .card-meta {
        display: flex;
        gap: var(--ui-pad-small);
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
    }
    .card-date {
        margin-left: auto;
    }
    .card-form, .card-schedule {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .meta-icon {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
        flex-shrink: 0;
    }
    .card-times {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
        margin-top: 0.25rem;
    }
    .time-badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        background: var(--color-gray-200, #f0f0f0);
        border-radius: var(--ui-radius-small);
        font-size: 0.75rem;
        font-family: monospace;
    }
</style>
