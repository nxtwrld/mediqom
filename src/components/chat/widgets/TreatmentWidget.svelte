<script lang="ts">
	import TreatmentCard from '$components/session/shared/TreatmentCard.svelte';
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';
	import type { TreatmentNode } from '$components/session/types/visualization.d';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec, onInteraction }: Props = $props();

	let treatment: TreatmentNode = $derived({
		id: spec.id,
		type: spec.data.type ?? 'medication',
		name: spec.data.name ?? 'Unknown treatment',
		priority: spec.data.priority ?? 5,
		confidence: spec.data.confidence ?? 0.5,
		dosage: spec.data.dosage,
		effectiveness: spec.data.effectiveness,
		description: spec.data.description,
		urgency: spec.data.urgency,
		duration: spec.data.duration,
	});

	function handleClick() {
		onInteraction?.({
			widgetId: spec.id,
			widgetType: spec.type,
			action: 'click_treatment',
			payload: { name: treatment.name, type: treatment.type },
		});
	}
</script>

<div class="widget-treatment">
	<TreatmentCard {treatment} ontreatmentClick={handleClick} />
</div>

<style>
	.widget-treatment {
		padding: 4px;
	}

	.widget-treatment :global(.treatment-card) {
		min-height: auto;
	}
</style>
