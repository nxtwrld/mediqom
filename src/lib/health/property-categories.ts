import type { Signal } from '$lib/types.d';

/**
 * Property categories for ProfileDashboard tiles:
 * - static: Age, biological sex, blood type - opens ProfileEdit form
 * - manual: Height, weight, blood pressure - opens tabbed modal with editable history
 * - document: Cholesterol, glucose, etc. - opens tabbed modal with read-only history
 * - mixed: Signals with both manual and document entries - mixed editability
 */
export type PropertyCategory = 'static' | 'manual' | 'document' | 'mixed';

/**
 * Properties that are static/calculated and should open ProfileEdit
 */
export const STATIC_PROPERTIES = ['age', 'birthDate', 'biologicalSex', 'bloodType'];

/**
 * Properties that are typically entered manually by the user
 */
export const MANUAL_PROPERTIES = ['height', 'weight', 'bloodPressure'];

/**
 * Determines the category of a signal based on its name and source data
 *
 * @param signal - The signal name (e.g., 'height', 'cholesterol')
 * @param values - Array of signal values with source information
 * @returns The property category
 */
export function getPropertyCategory(signal: string, values?: Signal[]): PropertyCategory {
	// Static properties always go to ProfileEdit
	if (STATIC_PROPERTIES.includes(signal)) {
		return 'static';
	}

	// If no values, assume manual for known manual properties
	if (!values || values.length === 0) {
		return MANUAL_PROPERTIES.includes(signal) ? 'manual' : 'document';
	}

	// Check source types in values
	const hasManual = values.some(v => v.source === 'input' || !v.refId);
	const hasDocument = values.some(v => v.source !== 'input' && v.refId);

	if (hasManual && hasDocument) {
		return 'mixed';
	}
	if (hasDocument) {
		return 'document';
	}
	return 'manual';
}

/**
 * Check if a signal entry is editable (manual entry)
 */
export function isEntryEditable(entry: Signal): boolean {
	return entry.source === 'input' || !entry.refId;
}

/**
 * Check if a property category allows adding new entries
 */
export function canAddEntries(category: PropertyCategory): boolean {
	return category !== 'document';
}
