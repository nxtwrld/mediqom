<script lang="ts">
	import { t } from '$lib/i18n';
	import type { Signal } from '$lib/types.d';

	interface Props {
		signal: string;
		unit?: string;
		entry?: Signal;
		onsave: (entry: Omit<Signal, 'signal'>) => void;
		oncancel: () => void;
	}

	let { signal, unit = '', entry, onsave, oncancel }: Props = $props();

	// Form state
	let dateId: string = Math.random().toString(36).substring(7);
	let valueId: string = Math.random().toString(36).substring(7);
	let date = $state(entry?.date || new Date().toISOString().split('T')[0]);
	let value = $state<string | number>(entry?.value ?? '');

	function handleSave() {
		const numValue = typeof value === 'string' ? parseFloat(value) : value;

		if (isNaN(numValue)) {
			return;
		}

		onsave({
			value: numValue,
			date,
			unit: unit || entry?.unit || '',
			source: 'input',
			reference: entry?.reference || ''
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSave();
		} else if (event.key === 'Escape') {
			oncancel();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form class="form entry-form" onkeydown={handleKeydown} onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
	<div class="form-row">
		<div class="input">
			<label for={dateId}>{$t('profile.health.history.date')}</label>
			<input type="date" id={dateId} bind:value={date} />
		</div>
		<div class="input">
			<label for={valueId}>{$t('profile.health.props.' + signal)}</label>
			<div class="field">
				<input type="number" id={valueId} bind:value step="any" />
				{#if unit}
					<span class="unit">{unit}</span>
				{/if}
			</div>
		</div>
	</div>
	<div class="form-actions">
		<button type="button" class="button --secondary" onclick={oncancel}>
			{$t('profile.health.history.cancel')}
		</button>
		<button type="submit" class="button --primary">
			{$t('profile.health.history.save')}
		</button>
	</div>
</form>

<style>
	.entry-form {
		padding: var(--gap);
		background: var(--color-gray-100);
		border-radius: var(--radius);
		margin-bottom: var(--gap-small);
	}

	.form-row {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--gap);
	}

	.field {
		position: relative;
		width: 100%;
	}

	.field input {
		width: 100%;
	}

	.field:has(.unit) input {
		padding-right: 4rem;
	}

	.field .unit {
		position: absolute;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		padding: 1rem;
		color: var(--color-text-muted);
	}

	@media screen and (max-width: 480px) {
		.form-row {
			grid-template-columns: 1fr;
		}
	}
</style>
