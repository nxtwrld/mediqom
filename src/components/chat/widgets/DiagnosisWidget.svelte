<script lang="ts">
	import SectionDiagnosis from '$components/documents/SectionDiagnosis.svelte';
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec }: Props = $props();

	// Transform spec.data to SectionDiagnosis format: array of { code, description, type, confidence, date, notes }
	let diagnosisData = $derived.by(() => {
		const d = spec.data;
		if (!d) return [];
		// If already an array, map fields
		const items = Array.isArray(d) ? d : [d];
		return items.map((item: any) => ({
			code: item.icd10 || item.code || '',
			description: item.name || item.description || 'Unknown',
			name: item.name || item.description || 'Unknown',
			type: item.type || 'primary',
			confidence: item.confidence || item.probability || undefined,
			date: item.date || undefined,
			notes: item.reasoning || item.notes || undefined,
		}));
	});
</script>

<div class="widget-diagnosis">
	<SectionDiagnosis data={diagnosisData} />
</div>

<style>
	.widget-diagnosis {
		padding: 0;
	}
</style>
