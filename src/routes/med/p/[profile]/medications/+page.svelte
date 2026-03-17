<script lang="ts">
	import { profile } from '$lib/profiles';
	import { medicationsByProfile, extractedMedicationsByProfile, addMedication, loadMedicationContent, loadExtractedMedicationContent } from '$lib/medications/store';
	import type { Medication } from '$lib/medications/types';
	import { t } from '$lib/i18n';
	import MedicationList from '$components/medications/MedicationList.svelte';
	import MedicationForm from '$components/medications/MedicationForm.svelte';
	import Modal from '$components/ui/Modal.svelte';

	const medications = medicationsByProfile($profile.id);
	const extracted = extractedMedicationsByProfile($profile.id);

	$effect(() => {
		loadMedicationContent($profile.id);
		loadExtractedMedicationContent($profile.id);
	});

	let showAddModal = $state(false);
	let saving = $state(false);

	async function handleSave(medication: Medication) {
		saving = true;
		try {
			await addMedication($profile.id, medication);
			showAddModal = false;
		} finally {
			saving = false;
		}
	}
</script>

<div class="page -empty">
	<div class="page-header">
		<h1 class="h1 heading">{$t('medications.title')}</h1>
		<button type="button" class="button -primary -small" onclick={() => showAddModal = true}>
			{$t('medications.add')}
		</button>
	</div>

	<MedicationList medications={$medications} extractedMedications={$extracted} profileId={$profile.id} />
</div>

{#if showAddModal}
	<Modal onclose={() => showAddModal = false}>
		<MedicationForm
			onSave={handleSave}
			onCancel={() => showAddModal = false}
			{saving}
		/>
	</Modal>
{/if}

<style>
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--ui-pad-medium);
	}
</style>
