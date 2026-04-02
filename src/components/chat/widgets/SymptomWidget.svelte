<script lang="ts">
	import SymptomCard from '$components/session/shared/SymptomCard.svelte';
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';
	import type { SymptomNode } from '$components/session/types/visualization.d';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec, onInteraction }: Props = $props();

	let symptom: SymptomNode = $derived({
		id: spec.id,
		text: spec.data.text ?? 'Unknown symptom',
		severity: spec.data.severity ?? 5,
		confidence: spec.data.confidence ?? 0.5,
		source: spec.data.source ?? 'transcript',
		duration: spec.data.duration,
		characteristics: spec.data.characteristics,
	});

	function handleClick() {
		onInteraction?.({
			widgetId: spec.id,
			widgetType: spec.type,
			action: 'click_symptom',
			payload: { text: symptom.text },
		});
	}
</script>

<div class="widget-symptom">
	<SymptomCard {symptom} onsymptomClick={handleClick} />
</div>

<style>
	.widget-symptom {
		padding: 4px;
	}

	.widget-symptom :global(.symptom-card) {
		min-height: auto;
	}
</style>
