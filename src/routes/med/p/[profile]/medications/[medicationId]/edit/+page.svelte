<script lang="ts">
	import { goto } from '$app/navigation';
	import { profile } from '$lib/profiles';
	import { getDocument } from '$lib/documents';
	import { updateMedication } from '$lib/medications/store';
	import { t } from '$lib/i18n';
	import MedicationForm from '$components/medications/MedicationForm.svelte';
	import type {
		MedicationDocument,
		Medication
	} from '$lib/medications/types';

	interface Props {
		data: { medicationId: string };
	}
	let { data }: Props = $props();

	let medication = $state<MedicationDocument | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	$effect(() => {
		loadMedication();
	});

	async function loadMedication() {
		try {
			const doc = await getDocument(data.medicationId);
			if (doc && (doc.metadata?.category === 'medication' || doc.subtype === 'medication')) {
				medication = doc as MedicationDocument;
			}
		} catch (e) {
			// document not found
		} finally {
			loading = false;
		}
	}

	async function handleSave(med: Medication) {
		if (!medication) return;
		saving = true;
		error = '';
		try {
			await updateMedication(medication, { medication: med, status: med.status });
			goto(`/med/p/${$profile.id}/medications/${medication.id}`);
		} catch (e: any) {
			error = e.message || 'Failed to update medication';
			saving = false;
		}
	}

	function handleCancel() {
		if (medication) {
			goto(`/med/p/${$profile.id}/medications/${medication.id}`);
		} else {
			goto(`/med/p/${$profile.id}/medications`);
		}
	}
</script>

<div class="page -empty">
	<h1 class="h1 heading">{$t('medications.edit')}</h1>

	{#if error}
		<div class="message -error">{error}</div>
	{/if}

	{#if loading}
		<p>{$t('app.loading')}</p>
	{:else if medication}
		<MedicationForm
			initialMedication={medication.content.medication}
			onSave={handleSave}
			onCancel={handleCancel}
			{saving}
		/>
	{:else}
		<p>{$t('medications.not-found')}</p>
	{/if}
</div>
