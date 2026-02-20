<script lang="ts">
	import { type Signal } from '$lib/types.d';
	import { profile } from '$lib/profiles';
	import ReferenceRange from '$components/charts/ReferenceRange.svelte';
	import ReferenceRangeLineChart from '$components/charts/ReferenceRangeLineChart.svelte';
	import Tabs from '$components/ui/Tabs.svelte';
	import TabHeads from '$components/ui/TabHeads.svelte';
	import TabHead from '$components/ui/TabHead.svelte';
	import TabPanel from '$components/ui/TabPanel.svelte';
	import HistoryList from './HistoryList.svelte';
	import { t } from '$lib/i18n';
	import {
		getPropertyCategory,
		type PropertyCategory,
		canAddEntries
	} from '$lib/health/property-categories';
	import { addSignalEntry } from '$lib/health/signal-crud';
	import EntryForm from './EntryForm.svelte';

	interface PropertyWithCategory extends Signal {
		category?: PropertyCategory;
	}

	interface Props {
		property: PropertyWithCategory;
	}

	let { property }: Props = $props();

	// Get signal data from profile
	let signalData = $derived(
		$profile?.health?.[property.signal] || $profile?.health?.signals?.[property.signal]
	);

	// Get history values
	let history = $derived(signalData?.values || []);

	// Determine category - use passed category or calculate from values
	let category = $derived<PropertyCategory>(
		property.category || getPropertyCategory(property.signal, history)
	);

	// Get unit from property or first history entry
	let unit = $derived(property.unit || (history[0]?.unit as string) || '');

	function toLineChartData(data: Signal[]) {
		return data.map((d) => {
			return {
				id: 'value',
				date: new Date(d.date),
				value: d.value,
				unit: d.unit
			};
		});
	}

	// Local state for adding entries
	let isAdding = $state(false);
	let isProcessing = $state(false);

	async function handleAdd(entry: Omit<Signal, 'signal'>) {
		if (!$profile?.id) return;
		isProcessing = true;

		const result = await addSignalEntry($profile.id, property.signal, entry);

		if (result.success) {
			isAdding = false;
		}
		isProcessing = false;
	}

	function startAdd() {
		isAdding = true;
	}

	function cancelAdd() {
		isAdding = false;
	}

	// Show chart tab only if we have enough data (2+ values)
	let showChartTab = $derived(history.length > 1);
</script>

<div class="property-overview">
	<h2 class="h2">{$t('profile.health.props.' + property.signal)}</h2>

	{#if showChartTab}
		<Tabs fixedHeight={false}>
			{#snippet tabHeads()}
				<TabHeads>
					<TabHead>{$t('profile.health.tabs.chart')}</TabHead>
					<TabHead>{$t('profile.health.tabs.history')}</TabHead>
				</TabHeads>
			{/snippet}

			<TabPanel>
				<div class="chart-panel">
					{#if property.reference}
						<ReferenceRange value={property.value} reference={property.reference} />
					{/if}

					<ReferenceRangeLineChart
						series={toLineChartData(history)}
						reference={property.reference}
					/>
				</div>
			</TabPanel>

			<TabPanel>
				<HistoryList values={history} signal={property.signal} {category} {unit} hideAddButton={true} />
			</TabPanel>
		</Tabs>
	{:else}
		<!-- No tabs when insufficient data - show history only -->
		<div class="history-only">
			<HistoryList values={history} signal={property.signal} {category} {unit} hideAddButton={true} />
		</div>
	{/if}

	<!-- Add button outside tabs - visible on both views -->
	{#if isAdding}
		<div class="add-form-container">
			<EntryForm signal={property.signal} {unit} onsave={handleAdd} oncancel={cancelAdd} />
		</div>
	{/if}

	{#if canAddEntries(category) && !isAdding}
		<div class="add-button-container">
			<button type="button" class="button --primary add-btn" onclick={startAdd} disabled={isProcessing}>
				{$t('profile.health.history.add-entry')}
			</button>
		</div>
	{/if}
</div>

<style>
	.property-overview {
		min-width: 350px;
		width: 50vw;
		max-width: 100vw;
		max-height: 80vh;
		overflow-y: auto;
	}

	.chart-panel {
		padding: var(--gap) 0;
	}

	.history-only {
		padding: var(--gap-small) 0;
	}

	.add-form-container {
		margin-top: var(--gap);
		padding: 0 var(--gap-small);
	}

	.add-button-container {
		margin-top: var(--gap);
		padding: 0 var(--gap-small);
	}

	.add-btn {
		width: 100%;
	}

	@media screen and (max-width: 600px) {
		.property-overview {
			width: 100vw;
			min-width: auto;
		}
	}
</style>
