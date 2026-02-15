<script lang="ts">
	import { t } from '$lib/i18n';
	import type { Signal } from '$lib/types.d';
	import type { PropertyCategory } from '$lib/health/property-categories';
	import { isEntryEditable, canAddEntries } from '$lib/health/property-categories';
	import EntryForm from './EntryForm.svelte';
	import { profile } from '$lib/profiles';
	import { addSignalEntry, updateSignalEntry, deleteSignalEntry } from '$lib/health/signal-crud';
	import { date as formatDate } from '$lib/datetime';

	interface Props {
		values: Signal[];
		signal: string;
		category: PropertyCategory;
		unit?: string;
		hideAddButton?: boolean;
	}

	let { values, signal, category, unit = '', hideAddButton = false }: Props = $props();

	// Local state for editing
	let editingIndex = $state<number | null>(null);
	let isAdding = $state(false);
	let isProcessing = $state(false);

	function formatDateDisplay(dateStr: string): string {
		if (!dateStr) return '';
		// Use the project's localized date formatting (DD.MM.YYYY)
		return formatDate(dateStr) || '';
	}

	function formatValue(val: any): string {
		if (typeof val === 'object' && val !== null) {
			// Handle compound values like blood pressure
			return Object.values(val).join('/');
		}
		return String(val);
	}

	async function handleAdd(entry: Omit<Signal, 'signal'>) {
		if (!$profile?.id) return;
		isProcessing = true;

		const result = await addSignalEntry($profile.id, signal, entry);

		if (result.success) {
			isAdding = false;
		}
		isProcessing = false;
	}

	async function handleUpdate(index: number, entry: Omit<Signal, 'signal'>) {
		if (!$profile?.id) return;
		isProcessing = true;

		const result = await updateSignalEntry($profile.id, signal, index, entry);

		if (result.success) {
			editingIndex = null;
		}
		isProcessing = false;
	}

	async function handleDelete(index: number) {
		if (!$profile?.id) return;
		if (!confirm($t('profile.health.history.confirm-delete'))) return;

		isProcessing = true;
		const result = await deleteSignalEntry($profile.id, signal, index);

		if (!result.success) {
			console.error('Failed to delete entry:', result.error);
		}
		isProcessing = false;
	}

	function startEdit(index: number) {
		editingIndex = index;
		isAdding = false;
	}

	function startAdd() {
		isAdding = true;
		editingIndex = null;
	}

	function cancelEdit() {
		editingIndex = null;
		isAdding = false;
	}
</script>

<div class="history-list">
	{#if isAdding}
		<EntryForm {signal} {unit} onsave={handleAdd} oncancel={cancelEdit} />
	{/if}

	{#if values.length === 0}
		<p class="no-data">{$t('profile.health.history.no-entries')}</p>
	{:else}
		<ul class="entries">
			{#each values as entry, index}
				<li class="entry" class:editing={editingIndex === index}>
					{#if editingIndex === index}
						<EntryForm
							{signal}
							{unit}
							{entry}
							onsave={(updated) => handleUpdate(index, updated)}
							oncancel={cancelEdit}
						/>
					{:else}
						<div class="entry-content">
							<span class="date">{formatDateDisplay(entry.date)}</span>
							<span class="value">
								{formatValue(entry.value)}
								{#if entry.unit || unit}
									<span class="unit">{entry.unit || unit}</span>
								{/if}
							</span>
							<div class="actions">
								{#if isEntryEditable(entry)}
									<button
										type="button"
										class="action-btn edit"
										onclick={() => startEdit(index)}
										disabled={isProcessing}
										aria-label={$t('profile.health.history.edit')}
									>
										<svg><use href="/icons.svg#edit"></use></svg>
									</button>
									<button
										type="button"
										class="action-btn delete"
										onclick={() => handleDelete(index)}
										disabled={isProcessing}
										aria-label={$t('profile.health.history.delete')}
									>
										<svg><use href="/icons.svg#close"></use></svg>
									</button>
								{:else}
									<span class="badge document-badge" title={$t('profile.health.history.from-document')}>
										<svg><use href="/icons-o.svg#report-general"></use></svg>
									</span>
								{/if}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if !hideAddButton && canAddEntries(category) && !isAdding}
		<button type="button" class="button --secondary add-btn" onclick={startAdd} disabled={isProcessing}>
			{$t('profile.health.history.add-entry')}
		</button>
	{/if}
</div>

<style>
	.history-list {
		padding: var(--gap-small) 0;
	}

	.no-data {
		color: var(--color-text-muted);
		text-align: center;
		padding: var(--gap);
	}

	.entries {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.entry {
		border-bottom: 1px solid var(--color-gray-200);
	}

	.entry:last-child {
		border-bottom: none;
	}

	.entry-content {
		display: flex;
		align-items: center;
		padding: var(--gap-small) 0;
		gap: var(--gap);
	}

	.date {
		flex: 0 0 auto;
		min-width: 7rem;
		color: var(--color-text-muted);
		font-size: var(--font-size-small);
	}

	.value {
		flex: 1;
		font-weight: 500;
	}

	.unit {
		font-weight: 400;
		color: var(--color-text-muted);
		margin-left: 0.25rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.action-btn {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		color: var(--color-text-muted);
		border-radius: var(--radius-small);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.action-btn:hover {
		background: var(--color-gray-200);
		color: var(--color-text);
	}

	.action-btn.delete:hover {
		color: var(--color-error);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.action-btn svg {
		width: 1rem;
		height: 1rem;
		fill: currentColor;
	}

	.badge {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.5rem;
		background: var(--color-gray-200);
		border-radius: var(--radius-small);
		font-size: var(--font-size-small);
		color: var(--color-text-muted);
	}

	.badge svg {
		width: 0.875rem;
		height: 0.875rem;
		fill: currentColor;
	}

	.add-btn {
		margin-top: var(--gap);
		width: 100%;
	}

	@media screen and (max-width: 480px) {
		.entry-content {
			flex-wrap: wrap;
		}

		.date {
			flex: 0 0 100%;
			margin-bottom: 0.25rem;
		}

		.value {
			flex: 1;
		}
	}
</style>
