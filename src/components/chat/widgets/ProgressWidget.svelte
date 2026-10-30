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
		padding: 1.2rem;
		display: flex;
		align-items: center;
		gap: 1.2rem;
	}

	.progress-chart {
		width: 6.4rem;
		height: 6.4rem;
		flex-shrink: 0;
	}

	.progress-label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.label-text {
		font-size: 1.2rem;
		color: var(--color-gray-800);
	}

	.label-value {
		font-size: 1.6rem;
		font-weight: 600;
		color: var(--color-black);
	}
</style>
