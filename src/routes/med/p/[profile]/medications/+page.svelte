<script lang="ts">
	import { profile, loadProfileDocuments } from '$lib/profiles';
	import { medicationsByProfile, extractedMedicationsByProfile, addMedication, loadMedicationContent, loadExtractedMedicationContent } from '$lib/medications/store';
	import type { Medication } from '$lib/medications/types';
	import { t } from '$lib/i18n';
	import MedicationList from '$components/medications/MedicationList.svelte';
	import MedicationForm from '$components/medications/MedicationForm.svelte';
	import Modal from '$components/ui/Modal.svelte';

	let medications = $derived(medicationsByProfile($profile.id));
	let extracted = $derived(extractedMedicationsByProfile($profile.id));

	$effect(() => {
		const id = $profile.id;
		loadProfileDocuments(id).then(() => {
			loadMedicationContent(id);
			loadExtractedMedicationContent(id);
		});
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
	<div class="heading">
		<h1 class="h1 heading">{$t('medications.title')}</h1>
		<div class="toolbar">
			<button type="button" onclick={() => showAddModal = true}>
				{$t('medications.add')}
			</button>
		</div>
	</div>

	<MedicationList medications={$medications} extractedMedications={$extracted} profileId={$profile.id} />
</div>

{#if showAddModal}
	<Modal onclose={() => { showAddModal = false; }}>
		<MedicationForm
			onSave={handleSave}
			onCancel={() => showAddModal = false}
			{saving}
		/>
	</Modal>
{/if}

