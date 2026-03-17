<script lang="ts">
	import { goto } from '$app/navigation';
	import { profile } from '$lib/profiles';
	import { getDocument } from '$lib/documents';
	import { deleteMedication, formatSchedule } from '$lib/medications/store';
	import { t } from '$lib/i18n';
	import type { MedicationDocument } from '$lib/medications/types';

	interface Props {
		data: { medicationId: string };
	}
	let { data }: Props = $props();

	let medication = $state<MedicationDocument | null>(null);
	let loading = $state(true);
	let deleting = $state(false);

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

	async function handleDelete() {
		if (!medication || !confirm($t('medications.confirm-delete'))) return;
		deleting = true;
		try {
			await deleteMedication(medication.id);
			goto(`/med/p/${$profile.id}/medications`);
		} catch (e) {
			deleting = false;
		}
	}
</script>

<div class="page -empty">
	{#if loading}
		<p>{$t('app.loading')}</p>
	{:else if medication}
		<div class="page-header">
			<h1 class="h1 heading">{medication.content.medication.medicationName}</h1>
			<div class="actions">
				<a
					href="/med/p/{$profile.id}/medications/{medication.id}/edit"
					class="button -small"
				>
					{$t('app.edit')}
				</a>
				<button class="button -small -danger" onclick={handleDelete} disabled={deleting}>
					{$t('app.delete')}
				</button>
			</div>
		</div>

		<div class="medication-detail">
			<section class="detail-section">
				<h2>{$t('medications.medication-info')}</h2>
				<dl class="detail-list">
					{#if medication.content.medication.genericName}
						<dt>{$t('medications.generic-name')}</dt>
						<dd>{medication.content.medication.genericName}</dd>
					{/if}
					<dt>{$t('medications.dosage')}</dt>
					<dd>{medication.content.medication.dosage}</dd>
					{#if medication.content.medication.strength}
						<dt>{$t('medications.strength')}</dt>
						<dd>{medication.content.medication.strength}</dd>
					{/if}
					<dt>{$t('medications.form')}</dt>
					<dd>{medication.content.medication.form}</dd>
					<dt>{$t('medications.route')}</dt>
					<dd>{medication.content.medication.route}</dd>
					{#if medication.content.medication.indication}
						<dt>{$t('medications.indication')}</dt>
						<dd>{medication.content.medication.indication}</dd>
					{/if}
					{#if medication.content.medication.prescriber}
						<dt>{$t('medications.prescriber')}</dt>
						<dd>{medication.content.medication.prescriber}</dd>
					{/if}
				</dl>
			</section>

			<section class="detail-section">
				<h2>{$t('medications.schedule')}</h2>
				<dl class="detail-list">
					<dt>{$t('medications.frequency')}</dt>
					<dd>{formatSchedule(medication.content.medication.schedule, $t)}</dd>
					<dt>{$t('medications.start-date')}</dt>
					<dd>{new Date(medication.content.medication.schedule.startDate).toLocaleDateString()}</dd>
					{#if medication.content.medication.schedule.endDate}
						<dt>{$t('medications.end-date')}</dt>
						<dd>
							{new Date(medication.content.medication.schedule.endDate).toLocaleDateString()}
						</dd>
					{/if}
					{#if medication.content.medication.schedule.pillCount}
						<dt>{$t('medications.pill-count')}</dt>
						<dd>{medication.content.medication.schedule.pillCount}</dd>
					{/if}
				</dl>
			</section>

			<section class="detail-section">
				<h2>{$t('medications.status')}</h2>
				<span class="status-badge -{medication.content.status}">
					{$t(`medications.status-${medication.content.status}`)}
				</span>
			</section>

			{#if medication.content.medication.notes}
				<section class="detail-section">
					<h2>{$t('medications.notes')}</h2>
					<p>{medication.content.medication.notes}</p>
				</section>
			{/if}
		</div>
	{:else}
		<p>{$t('medications.not-found')}</p>
	{/if}
</div>

<style>
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--ui-pad-large);
	}
	.actions {
		display: flex;
		gap: var(--ui-pad-small);
	}
	.medication-detail {
		display: flex;
		flex-direction: column;
		gap: var(--ui-pad-large);
	}
	.detail-section h2 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: var(--ui-pad-small);
		color: var(--color-text-secondary);
	}
	.detail-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--ui-pad-small) var(--ui-pad-medium);
	}
	.detail-list dt {
		font-weight: 500;
		color: var(--color-text-secondary);
	}
	.detail-list dd {
		margin: 0;
	}
	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: var(--ui-radius-small);
		font-size: 0.875rem;
		font-weight: 500;
	}
	.status-badge.-active {
		background: var(--color-positive-light, #e8f5e9);
		color: var(--color-positive);
	}
	.status-badge.-paused {
		background: var(--color-warning-light, #fff3e0);
		color: var(--color-warning);
	}
	.status-badge.-completed,
	.status-badge.-discontinued {
		background: var(--color-gray-200, #eee);
		color: var(--color-text-secondary);
	}
</style>
