<script lang="ts">
	import SectionTreatmentPlan from '$components/documents/SectionTreatmentPlan.svelte';
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec }: Props = $props();

	// Transform spec.data to SectionTreatmentPlan format
	// Route single treatment into correct sub-array by type
	let treatmentData = $derived.by(() => {
		const d = spec.data;
		if (!d) return { hasTreatmentPlan: false };

		// If data already has hasTreatmentPlan, pass through
		if (d.hasTreatmentPlan !== undefined) return d;

		const type = d.type ?? 'therapy';
		const item = {
			name: d.name || 'Unknown treatment',
			dosage: d.dosage,
			description: d.description,
			duration: d.duration,
			frequency: d.frequency,
			status: d.status || 'planned',
			priority: d.priority || d.urgency,
		};

		if (type === 'medication') {
			return {
				hasTreatmentPlan: true,
				medications: [{ ...item, route: d.route, indication: d.indication }],
			};
		}
		if (type === 'procedure') {
			return {
				hasTreatmentPlan: true,
				procedures: [{ ...item, type: d.procedureType || 'surgical' }],
			};
		}
		// Default: therapy
		return {
			hasTreatmentPlan: true,
			therapies: [{ ...item, type: d.therapyType || 'other' }],
		};
	});
</script>

<div class="widget-treatment">
	<SectionTreatmentPlan data={treatmentData} />
</div>

<style>
	.widget-treatment {
		padding: 0;
	}
</style>
