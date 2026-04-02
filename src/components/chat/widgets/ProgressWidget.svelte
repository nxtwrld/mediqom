<script lang="ts">
	import ProgressRound from '$components/charts/ProgressRound.svelte';
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec, onInteraction }: Props = $props();

	let value = $derived(Math.min(100, Math.max(0, spec.data.value ?? 0)));
	let label: string = $derived(spec.data.label ?? '');
	let unit: string = $derived(spec.data.unit ?? '%');
</script>

<div class="widget-progress">
	<div class="progress-chart">
		<ProgressRound {value} />
	</div>
	{#if label}
		<div class="progress-label">
			<span class="label-text">{label}</span>
			<span class="label-value">{spec.data.value}{unit}</span>
		</div>
	{/if}
</div>

<style>
	.widget-progress {
		padding: 12px;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.progress-chart {
		width: 64px;
		height: 64px;
		flex-shrink: 0;
	}

	.progress-label {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.label-text {
		font-size: 12px;
		color: var(--color-gray-800);
	}

	.label-value {
		font-size: 16px;
		font-weight: 600;
		color: var(--color-black);
	}
</style>
