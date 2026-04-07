// Generative UI Widget Types
// Widgets are structured data specs that map to pre-built Svelte components.
// The AI generates these as part of its structured response; they are never arbitrary HTML.

export type WidgetType =
	| 'lab_trend_chart'
	| 'diagnosis_card'
	| 'symptom_summary'
	| 'treatment_plan'
	| 'data_table'
	| 'anatomy_highlight'
	| 'progress_indicator';

export interface WidgetSpec {
	id: string;
	type: WidgetType;
	data: Record<string, any>;
	title?: string;
	interactive?: boolean;
}

export interface WidgetInteraction {
	widgetId: string;
	widgetType: string;
	action: string;
	payload: Record<string, any>;
}

/** All allowed widget type strings for validation */
export const WIDGET_TYPES: readonly WidgetType[] = [
	'lab_trend_chart',
	'diagnosis_card',
	'symptom_summary',
	'treatment_plan',
	'data_table',
	'anatomy_highlight',
	'progress_indicator',
] as const;

/** Validate that a string is a known widget type */
export function isValidWidgetType(type: string): type is WidgetType {
	return WIDGET_TYPES.includes(type as WidgetType);
}
