<script lang="ts">
	import ReferenceRangeLineChart from '$components/charts/ReferenceRangeLineChart.svelte';
	import ReferenceRange from '$components/charts/ReferenceRange.svelte';
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec, onInteraction }: Props = $props();

	// Transform series data: ensure dates are Date objects
	let series = $derived(
		(spec.data?.series ?? []).map((item: any) => ({
			date: new Date(item.date || item.time || item.timestamp),
			value: Number(item.value ?? 0)
		})).filter((item: any) => !isNaN(item.date.getTime()) && item.value !== 0)
	);

	// Derive reference string from ranges (find normal range → "min-max") or fallback
	let reference = $derived.by(() => {
		const ranges = spec.data?.ranges;
		if (Array.isArray(ranges)) {
			const normal = ranges.find((r: any) => r.name === 'normal');
			if (normal && normal.min != null && normal.max != null) {
				return `${normal.min}-${normal.max}`;
			}
		}
		if (spec.data?.reference) return String(spec.data.reference);
		return '0-100';
	});

	let unit = $derived(spec.data?.unit ?? '');

	// Latest value for single-point display
	let latestValue = $derived(
		series.length > 0 ? series[series.length - 1].value : (spec.data?.value != null ? Number(spec.data.value) : null)
	);
</script>

<div class="widget-lab-trend">
	{#if series.length > 1}
		<ReferenceRangeLineChart
			{unit}
			{reference}
			{series}
		/>
	{:else if latestValue != null}
		<div class="single-value">
			<ReferenceRange value={latestValue} {reference} />
		</div>
	{:else}
		<p class="no-data">No data available.</p>
	{/if}
</div>

<style>
	.widget-lab-trend {
		padding: 0;
		min-height: 60px;
	}

	.single-value {
		padding: 8px 12px;
	}

	.no-data {
		font-size: 12px;
		color: var(--color-gray-800);
		text-align: center;
		padding: 20px 10px;
		margin: 0;
	}
</style>
