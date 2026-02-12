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
		type PropertyCategory
	} from '$lib/health/property-categories';

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
</script>

<div class="property-overview">
	<h2 class="h2">{$t('profile.health.props.' + property.signal)}</h2>

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

				{#if history.length > 1}
					<ReferenceRangeLineChart
						series={toLineChartData(history)}
						reference={property.reference}
					/>
				{:else}
					<p class="no-history">{$t('profile.health.history.no-chart-data')}</p>
				{/if}
			</div>
		</TabPanel>

		<TabPanel>
			<HistoryList values={history} signal={property.signal} {category} {unit} />
		</TabPanel>
	</Tabs>
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

	.no-history {
		color: var(--color-text-muted);
		text-align: center;
		padding: var(--gap);
	}

	@media screen and (max-width: 600px) {
		.property-overview {
			width: 100vw;
			min-width: auto;
		}
	}
</style>
