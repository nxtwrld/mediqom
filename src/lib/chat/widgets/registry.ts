// Widget Registry — compile-time allowlist mapping widget types to Svelte components.
// Only registered types can render; unknown types are rejected by the dispatcher.

import type { Component } from 'svelte';
import type { WidgetType, WidgetSpec, WidgetInteraction } from './types';
import LabTrendWidget from '$components/chat/widgets/LabTrendWidget.svelte';
import DiagnosisWidget from '$components/chat/widgets/DiagnosisWidget.svelte';
import SymptomWidget from '$components/chat/widgets/SymptomWidget.svelte';
import TreatmentWidget from '$components/chat/widgets/TreatmentWidget.svelte';
import DataTableWidget from '$components/chat/widgets/DataTableWidget.svelte';
import AnatomyHighlightWidget from '$components/chat/widgets/AnatomyHighlightWidget.svelte';
import ProgressWidget from '$components/chat/widgets/ProgressWidget.svelte';

export interface WidgetComponentProps {
	spec: WidgetSpec;
	onInteraction?: (interaction: WidgetInteraction) => void;
}

const registry = new Map<WidgetType, Component<WidgetComponentProps>>([
	['lab_trend_chart', LabTrendWidget as unknown as Component<WidgetComponentProps>],
	['diagnosis_card', DiagnosisWidget as unknown as Component<WidgetComponentProps>],
	['symptom_summary', SymptomWidget as unknown as Component<WidgetComponentProps>],
	['treatment_plan', TreatmentWidget as unknown as Component<WidgetComponentProps>],
	['data_table', DataTableWidget as unknown as Component<WidgetComponentProps>],
	['anatomy_highlight', AnatomyHighlightWidget as unknown as Component<WidgetComponentProps>],
	['progress_indicator', ProgressWidget as unknown as Component<WidgetComponentProps>],
]);

/** Look up the Svelte component for a widget type. Returns null for unknown types. */
export function getWidgetComponent(type: string): Component<WidgetComponentProps> | null {
	return registry.get(type as WidgetType) ?? null;
}
