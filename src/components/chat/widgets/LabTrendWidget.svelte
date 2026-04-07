<script lang="ts">
	import SignalHistory from '$components/documents/SignalHistory.svelte';
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec, onInteraction }: Props = $props();

	// Map spec.data to SignalHistory props
	let series = $state(spec.data?.series ?? []);
	let ranges = $state(spec.data?.ranges ?? []);

	function handleClick() {
		onInteraction?.({
			widgetId: spec.id,
			widgetType: spec.type,
			action: 'click_trend',
			payload: { code: spec.data.code },
		});
	}
</script>

<div class="widget-lab-trend" role="button" tabindex="0" onclick={handleClick} onkeydown={(e) => { if (e.key === 'Enter') handleClick(); }}>
	{#if series.length > 1}
		<SignalHistory
			code={spec.data.code ?? 'unknown'}
			unit={spec.data.unit ?? ''}
			status={spec.data.status ?? 'ok'}
			date={spec.data.date ?? ''}
			bind:series
			bind:ranges
		/>
	{:else}
		<p class="no-data">Not enough data points to display trend chart.</p>
	{/if}
</div>

<style>
	.widget-lab-trend {
		padding: 8px;
		min-height: 120px;
		cursor: pointer;
	}

	.no-data {
		font-size: 12px;
		color: var(--color-gray-800);
		text-align: center;
		padding: 20px 10px;
		margin: 0;
	}
</style>
