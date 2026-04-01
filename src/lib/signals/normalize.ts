/**
 * Signal normalization module.
 * Delegates signal name resolution to the unified signal catalog,
 * normalizes units, and fills missing reference ranges from defaults.
 */
import {
	resolveSignalName,
	getDefaultReference as catalogGetDefaultReference
} from '$data/signal-catalog';

// =====================================================
// Unit equivalence map → canonical unit
// (Units are not signal-specific, kept as a small local map)
// =====================================================

const UNIT_ALIASES: Record<string, string> = {
	'bpm': 'beats/min',
	'mm hg': 'mmHg',
	'mmhg': 'mmHg',
	'mg/dl': 'mg/dL',
	'g/dl': 'g/dL',
	'µg/l': 'µg/L',
	'ug/l': 'µg/L',
	'nmol/l': 'nmol/L',
	'pmol/l': 'pmol/L',
	'mmol/l': 'mmol/L',
	'µmol/l': 'µmol/L',
	'umol/l': 'µmol/L',
	'miu/l': 'mIU/L',
	'u/l': 'U/L',
	'iu/l': 'U/L',
	'g/l': 'g/L',
	'mg/l': 'mg/L',
	'ml/min/1.73m2': 'mL/min/1.73m²',
	'breaths/minute': 'breaths/min',
	'kg/m2': 'kg/m²',
	'beats per minute': 'beats/min',
	'mm/h': 'mm/hr',
};

// =====================================================
// Public API
// =====================================================

/**
 * Normalize a raw signal name to its canonical key.
 * Delegates to the unified signal catalog.
 */
export function normalizeSignalName(raw: string): string {
	return resolveSignalName(raw);
}

/**
 * Normalize a unit string to canonical form.
 */
export function normalizeUnit(unit: string): string {
	if (!unit) return unit;
	const lower = unit.toLowerCase().trim();
	return UNIT_ALIASES[lower] ?? unit;
}

/**
 * Get a default reference range string ("low-high") for a signal key.
 * Delegates to the unified signal catalog.
 */
export function getDefaultReference(
	signalKey: string,
	age?: number,
	sex?: string
): string | undefined {
	return catalogGetDefaultReference(signalKey, age, sex);
}

interface SignalEntry {
	signal: string;
	value: any;
	unit: string;
	reference: string;
	date: string;
	source?: string;
	refId?: string;
	[key: string]: any;
}

/**
 * Normalize a signal entry: canonical name, canonical unit, fill missing reference.
 * Returns a new object (no mutation).
 */
export function normalizeSignalEntry(
	entry: SignalEntry,
	profileAge?: number,
	profileSex?: string
): SignalEntry {
	const normalizedName = normalizeSignalName(entry.signal);
	const normalizedUnit = normalizeUnit(entry.unit);

	// Fill reference only if empty
	let reference = entry.reference;
	if (!reference) {
		reference = getDefaultReference(normalizedName, profileAge, profileSex) ?? '';
	}

	return {
		...entry,
		signal: normalizedName,
		unit: normalizedUnit,
		reference,
	};
}
