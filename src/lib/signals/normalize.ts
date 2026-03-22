/**
 * Signal normalization module.
 * Maps variant signal names to canonical keys from lab.properties.defaults.json,
 * normalizes units, and fills missing reference ranges from defaults.
 */
import labDefaults from '$data/lab.properties.defaults.json';

// =====================================================
// Canonical key set (loaded once from JSON)
// =====================================================

const CANONICAL_KEYS = new Set(Object.keys(labDefaults));

// =====================================================
// Signal alias map → canonical key
// =====================================================

const SIGNAL_ALIASES: Record<string, string> = {
	// Heart / pulse
	pulse: 'heart_rate',
	hr: 'heart_rate',
	'heart rate': 'heart_rate',
	heartrate: 'heart_rate',
	'resting heart rate': 'resting_heart_rate',
	'resting pulse': 'resting_heart_rate',
	'hrv': 'heart_rate_variability',

	// Blood pressure
	'bp systolic': 'systolic',
	'systolic blood pressure': 'systolic',
	'systolic bp': 'systolic',
	'bp diastolic': 'diastolic',
	'diastolic blood pressure': 'diastolic',
	'diastolic bp': 'diastolic',

	// Blood sugar / glucose
	'blood glucose': 'blood_sugar',
	'fasting glucose': 'blood_sugar',
	'fasting blood sugar': 'blood_sugar',

	// Oxygen
	'spo2': 'oxygen_saturation',
	'o2 saturation': 'oxygen_saturation',
	'blood oxygen': 'oxygen_saturation',

	// Respiratory
	'breathing rate': 'respiratory_rate',
	'resp rate': 'respiratory_rate',

	// Body composition
	'body mass index': 'bmi',
	'body fat': 'body_fat_percentage',

	// Cholesterol
	'total cholesterol': 'cholesterol',
	'hdl': 'hdl_cholesterol',
	'ldl': 'ldl_cholesterol',

	// Blood count
	'wbc': 'white_blood_cells',
	'rbc': 'red_blood_cells',
	'hgb': 'hemoglobin',
	'hb': 'hemoglobin',
	'hct': 'hematocrit',
	'plt': 'platelets',

	// Liver
	'alanine aminotransferase': 'alt',
	'aspartate aminotransferase': 'ast',
	'gamma-glutamyl transferase': 'ggt',
	'alkaline phosphatase': 'alp',

	// Kidney
	'gfr': 'egfr',
	'glomerular filtration rate': 'egfr',

	// Thyroid
	'free t4': 'ft4',
	'thyroxine': 'ft4',
	'thyroid stimulating hormone': 'tsh',

	// Inflammation
	'c-reactive protein': 'crp',
	'sed rate': 'esr',
	'sedimentation rate': 'esr',

	// Vitamins
	'vitamin d': 'vitamin_d',
	'25-hydroxyvitamin d': 'vitamin_d',
};

// =====================================================
// Unit equivalence map → canonical unit
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
 * Returns the original string if no canonical match is found.
 */
export function normalizeSignalName(raw: string): string {
	if (!raw) return raw;

	// Already canonical?
	if (CANONICAL_KEYS.has(raw)) return raw;

	const lower = raw.toLowerCase().trim();

	// Check alias map
	if (SIGNAL_ALIASES[lower]) return SIGNAL_ALIASES[lower];

	// Try snake_case conversion
	const snaked = lower.replace(/[\s-]+/g, '_');
	if (CANONICAL_KEYS.has(snaked)) return snaked;

	// Pass-through for unknown signals
	return raw;
}

/**
 * Normalize a unit string to canonical form.
 */
export function normalizeUnit(unit: string): string {
	if (!unit) return unit;
	const lower = unit.toLowerCase().trim();
	return UNIT_ALIASES[lower] ?? unit;
}

interface ReferenceRange {
	sex: string;
	ageRange: { min: number; max: number };
	low: number | string | null;
	high: number | string | null;
}

/**
 * Get a default reference range string ("low-high") for a signal key.
 * Filters by age/sex when provided; falls back to adult "any" range.
 */
export function getDefaultReference(
	signalKey: string,
	age?: number,
	sex?: string
): string | undefined {
	const def = (labDefaults as Record<string, any>)[signalKey];
	if (!def?.referenceRange || def.referenceRange.length === 0) return undefined;

	const ranges = def.referenceRange as ReferenceRange[];

	// Try to find best match by age + sex
	let match: ReferenceRange | undefined;

	if (age != null) {
		const sexLower = sex?.toLowerCase() ?? 'any';

		// Exact sex + age match
		match = ranges.find(
			(r) =>
				(r.sex === sexLower || r.sex === 'any') &&
				age >= r.ageRange.min &&
				age < r.ageRange.max
		);

		// Fallback: "any" sex + age match
		if (!match) {
			match = ranges.find(
				(r) => r.sex === 'any' && age >= r.ageRange.min && age < r.ageRange.max
			);
		}
	}

	// Fallback: pick adult "any" range (18+)
	if (!match) {
		match = ranges.find((r) => r.sex === 'any' && r.ageRange.min >= 18);
	}

	// Last resort: first range with "any" sex
	if (!match) {
		match = ranges.find((r) => r.sex === 'any');
	}

	// Ultimate fallback: first range
	if (!match) {
		match = ranges[0];
	}

	if (!match) return undefined;

	// Only return numeric ranges
	if (typeof match.low !== 'number' || (match.high !== null && typeof match.high !== 'number')) {
		return undefined;
	}

	if (match.high === null) {
		// Open-ended range (e.g., egfr ≥ 90)
		return `${match.low}-`;
	}

	return `${match.low}-${match.high}`;
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
