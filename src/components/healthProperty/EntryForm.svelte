<script lang="ts">
	import { t } from '$lib/i18n';
	import Input from '$components/forms/Input.svelte';
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
<div class="entry-form" onkeydown={handleKeydown} role="form">
	<div class="form-row">
		<div class="field date-field">
			<Input type="date" bind:value={date} label={$t('profile.health.history.date')} />
		</div>
		<div class="field value-field">
			<Input
				type="number"
				bind:value
				label={$t('profile.health.props.' + signal)}
				placeholder={unit}
				step="any"
			/>
			{#if unit}
				<span class="unit">{unit}</span>
			{/if}
		</div>
	</div>
	<div class="form-actions">
		<button type="button" class="button --secondary" onclick={oncancel}>
			{$t('profile.health.history.cancel')}
		</button>
		<button type="button" class="button --primary" onclick={handleSave}>
			{$t('profile.health.history.save')}
		</button>
	</div>
</div>

<style>
	.entry-form {
		padding: var(--gap-small);
		background: var(--color-gray-100);
		border-radius: var(--radius);
		margin-bottom: var(--gap-small);
	}

	.form-row {
		display: flex;
		gap: var(--gap);
		margin-bottom: var(--gap-small);
	}

	.field {
		position: relative;
	}

	.date-field {
		flex: 0 0 auto;
		min-width: 10rem;
	}

	.value-field {
		flex: 1;
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.unit {
		color: var(--color-text-muted);
		font-size: var(--font-size-small);
		padding-bottom: 0.5rem;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--gap-small);
	}

	@media screen and (max-width: 480px) {
		.form-row {
			flex-direction: column;
		}

		.date-field {
			min-width: 100%;
		}
	}
</style>
