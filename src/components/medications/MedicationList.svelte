<script lang="ts">
    import { t } from '$lib/i18n';
    import type { MedicationDocument, Medication } from '$lib/medications/types';
    import MedicationCard from './MedicationCard.svelte';

    interface Props {
        medications: MedicationDocument[];
        extractedMedications?: Partial<Medication>[];
        profileId: string;
    }

    let { medications, extractedMedications = [], profileId }: Props = $props();

    const hasAny = $derived(medications.length > 0 || extractedMedications.length > 0);
</script>

{#if !hasAny}
    <div class="empty-state">
        <svg class="empty-icon" aria-hidden="true"><use href="/icons.svg#form-tablet"></use></svg>
        <p>{$t('medications.no-medications')}</p>
        <a href="/med/p/{profileId}/medications/add" class="button -primary">
            {$t('medications.add-first')}
        </a>
    </div>
{:else}
    <div class="medication-grid">
        {#each medications as med (med.id)}
            <MedicationCard medication={med} {profileId} />
        {/each}
    </div>

    {#if extractedMedications.length > 0}
        <h3 class="section-heading">{$t('medications.extracted-medications')}</h3>
        <div class="medication-grid">
            {#each extractedMedications as ext, i (ext.sourceDocumentId + '-' + i)}
                <MedicationCard extracted={ext} {profileId} />
            {/each}
        </div>
    {/if}
{/if}

<style>
    .medication-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
        gap: var(--ui-pad-medium);
    }
    .section-heading {
        margin: var(--ui-pad-large) 0 var(--ui-pad-medium);
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--color-text-secondary);
    }
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ui-pad-medium);
        padding: var(--ui-pad-xlarge);
        text-align: center;
        color: var(--color-text-secondary);
    }
    .empty-icon {
        width: 3rem;
        height: 3rem;
        fill: currentColor;
        opacity: 0.4;
    }
</style>
