<script lang="ts">
	import { goto } from '$app/navigation';
	import { profile } from '$lib/profiles';
	import { addMedication } from '$lib/medications/store';
	import { t } from '$lib/i18n';
	import MedicationForm from '$components/medications/MedicationForm.svelte';
	import type { Medication } from '$lib/medications/types';

	let saving = $state(false);
	let error = $state('');

	async function handleSave(medication: Medication) {
		saving = true;
		error = '';
		try {
			await addMedication($profile.id, medication);
			goto(`/med/p/${$profile.id}/medications`);
		} catch (e: any) {
			error = e.message || 'Failed to save medication';
			saving = false;
		}
	}

	function handleCancel() {
		goto(`/med/p/${$profile.id}/medications`);
	}
</script>

<div class="page -empty">
	<h1 class="h1 heading">{$t('medications.add')}</h1>

	{#if error}
		<div class="message -error">{error}</div>
	{/if}

	<MedicationForm onSave={handleSave} onCancel={handleCancel} {saving} />
</div>
