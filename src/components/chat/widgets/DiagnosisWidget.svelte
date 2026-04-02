<script lang="ts">
	import DiagnosisCard from '$components/session/shared/DiagnosisCard.svelte';
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';
	import type { DiagnosisNode } from '$components/session/types/visualization.d';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec, onInteraction }: Props = $props();

	// Map spec.data to DiagnosisNode, applying safe defaults
	let diagnosis: DiagnosisNode = $derived({
		id: spec.id,
		name: spec.data.name ?? 'Unknown',
		probability: spec.data.probability ?? 0.5,
		priority: spec.data.priority ?? 5,
		confidence: spec.data.confidence ?? spec.data.probability ?? 0.5,
		reasoning: spec.data.reasoning ?? '',
		icd10: spec.data.icd10,
		redFlags: spec.data.redFlags,
		requiresInvestigation: spec.data.requiresInvestigation,
		suppressed: false,
	});

	function handleClick() {
		onInteraction?.({
			widgetId: spec.id,
			widgetType: spec.type,
			action: 'click_diagnosis',
			payload: { name: diagnosis.name, icd10: diagnosis.icd10 },
		});
	}
</script>

<div class="widget-diagnosis">
	<DiagnosisCard {diagnosis} ondiagnosisClick={handleClick} />
</div>

<style>
	.widget-diagnosis {
		padding: 4px;
	}

	.widget-diagnosis :global(.diagnosis-card) {
		min-height: auto;
	}
</style>
