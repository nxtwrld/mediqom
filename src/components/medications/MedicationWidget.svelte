<script lang="ts">
    import { t } from '$lib/i18n';
    import { activeMedicationsByProfile, extractedMedicationsByProfile, addMedication, loadMedicationContent, loadExtractedMedicationContent } from '$lib/medications/store';
    import type { Medication } from '$lib/medications/types';
    import MedicationCard from './MedicationCard.svelte';
    import MedicationForm from './MedicationForm.svelte';
    import Modal from '$components/ui/Modal.svelte';
    import { loadProfileDocuments } from '$lib/profiles';

    interface Props {
        profileId: string;
    }

    let { profileId }: Props = $props();

    const medications = activeMedicationsByProfile(profileId);
    const extracted = extractedMedicationsByProfile(profileId);

    $effect(() => {
        loadProfileDocuments(profileId).then(() => {
            loadMedicationContent(profileId);
            loadExtractedMedicationContent(profileId);
        });
    });

    let showAddModal = $state(false);
    let saving = $state(false);

    async function handleSave(medication: Medication) {
        saving = true;
        try {
            await addMedication(profileId, medication);
            showAddModal = false;
        } finally {
            saving = false;
        }
    }
</script>

<section class="medication-widget">
    <div class="widget-header">
        <h3 class="h3 heading">{$t('medications.title')}</h3>
        <a href="/med/p/{profileId}/medications" class="a">{$t('medications.view-all')}</a>
    </div>

    {#if $medications.length > 0 || $extracted.length > 0}
        <div class="medication-grid">
            {#each $medications as med (med.id)}
                <MedicationCard medication={med} {profileId} />
            {/each}
            {#each $extracted as ext, i (ext.sourceDocumentId + '-' + i)}
                <MedicationCard extracted={ext} {profileId} />
            {/each}
            <button type="button" class="add-card" onclick={() => showAddModal = true}>
                <svg><use href="/icons.svg#plus"></use></svg>
                <span>{$t('medications.add')}</span>
            </button>
        </div>
    {:else}
        <div class="empty-state">
            <svg class="empty-icon" aria-hidden="true"><use href="/icons.svg#pills"></use></svg>
            <p>{$t('medications.no-medications')}</p>
            <button type="button" class="button -primary" onclick={() => showAddModal = true}>
                {$t('medications.add-first')}
            </button>
        </div>
    {/if}
</section>

{#if showAddModal}
    <Modal onclose={() => { showAddModal = false; }}>
        <MedicationForm
            onSave={handleSave}
            onCancel={() => showAddModal = false}
            {saving}
        />
    </Modal>
{/if}

<style>
    .medication-widget {
        margin-bottom: var(--ui-pad-large);
    }
    .widget-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--ui-pad-medium);
    }
    .widget-header .heading {
        margin: 0;
    }
    .medication-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
        gap: var(--ui-pad-medium);
    }
    .add-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--ui-pad-small);
        padding: var(--ui-pad-medium);
        border: 2px dashed var(--color-border);
        border-radius: var(--ui-radius-medium);
        color: var(--color-text-secondary);
        text-decoration: none;
        transition: border-color 0.15s ease, color 0.15s ease;
        min-height: 5rem;
    }
    .add-card:hover {
        border-color: var(--color-text-primary);
        color: var(--color-text-primary);
    }
    .add-card svg {
        width: 1.5rem;
        height: 1.5rem;
        fill: currentColor;
    }
    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ui-pad-medium);
        padding: var(--ui-pad-xlarge);
        background: var(--color-gray-200, #f5f5f5);
        border-radius: var(--ui-radius-medium);
        text-align: center;
        color: var(--color-text-secondary);
    }
    .empty-icon {
        width: 2.5rem;
        height: 2.5rem;
        fill: currentColor;
        opacity: 0.4;
    }
    @media screen and (max-width: 800px) {
        .medication-grid {
            grid-template-columns: 1fr;
            overflow-x: auto;
        }
    }
</style>
