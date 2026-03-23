/**
 * Signal Catalog — Single source of truth for all signal/lab property definitions.
 *
 * Pre-builds indexes at import time for O(1) lookups by:
 * - canonical key
 * - synonym (case-insensitive)
 * - LOINC code
 * - HealthKit type
 */

import catalog from './signal-catalog.json';

// =====================================================
// Types
// =====================================================

export interface ReferenceRange {
	sex: string;
	ageRange: { min: number; max: number };
	low: number | string | null;
	high: number | string | null;
}

export interface SignalCatalogEntry {
	displayName: string;
	category: string;
	type: string;
	unit?: string;
	referenceRange: ReferenceRange[];
	valueExpirationInDays?: number;
	description?: string;
	lowInterpretation?: string;
	highInterpretation?: string;
	links?: string[];
	loincCodes?: string[];
	healthKitType?: string;
	synonyms: string[];
	localize?: boolean;
	options?: string[];
	signal?: string;
}

// =====================================================
// Pre-built indexes (computed once at import time)
// =====================================================

const _catalog = catalog as Record<string, SignalCatalogEntry>;

/** Set of all canonical signal keys */
export const CANONICAL_KEYS: Set<string> = new Set(Object.keys(_catalog));

/** Lowercase synonym → canonical key */
export const synonymToKey: Map<string, string> = new Map();

/** LOINC code → canonical key */
export const loincToKey: Map<string, string> = new Map();

/** HealthKit type → canonical key */
export const healthKitToKey: Map<string, string> = new Map();

// Build indexes
for (const [key, entry] of Object.entries(_catalog)) {
	// Index synonyms (lowercase)
	for (const syn of entry.synonyms) {
		const lower = syn.toLowerCase();
		if (!synonymToKey.has(lower)) {
			synonymToKey.set(lower, key);
		}
	}
	// Also index display name as synonym
	const displayLower = entry.displayName.toLowerCase();
	if (!synonymToKey.has(displayLower)) {
		synonymToKey.set(displayLower, key);
	}

	// Index LOINC codes
	if (entry.loincCodes) {
		for (const code of entry.loincCodes) {
			if (!loincToKey.has(code)) {
				loincToKey.set(code, key);
			}
		}
	}

	// Index HealthKit types
	if (entry.healthKitType) {
		if (!healthKitToKey.has(entry.healthKitType)) {
			healthKitToKey.set(entry.healthKitType, key);
		}
	}
}

// =====================================================
// Public API
// =====================================================

/** Get a signal entry by canonical key */
export function getSignal(key: string): SignalCatalogEntry | undefined {
	return _catalog[key];
}

/** Get all canonical keys */
export function getAllKeys(): string[] {
	return Object.keys(_catalog);
}

/** Get the full catalog object */
export function getCatalog(): Record<string, SignalCatalogEntry> {
	return _catalog;
}

/**
 * Resolve a raw signal name to its canonical key.
 * Checks: exact match → synonym map → snake_case conversion → pass-through.
 */
export function resolveSignalName(raw: string): string {
	if (!raw) return raw;

	// Already canonical?
	if (CANONICAL_KEYS.has(raw)) return raw;

	const lower = raw.toLowerCase().trim();

	// Check synonym index
	const fromSynonym = synonymToKey.get(lower);
	if (fromSynonym) return fromSynonym;

	// Try snake_case conversion
	const snaked = lower.replace(/[\s-]+/g, '_');
	if (CANONICAL_KEYS.has(snaked)) return snaked;

	// Pass-through for unknown signals
	return raw;
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
	const entry = _catalog[signalKey];
	if (!entry?.referenceRange || entry.referenceRange.length === 0) return undefined;

	const ranges = entry.referenceRange;
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
		return `${match.low}-`;
	}

	return `${match.low}-${match.high}`;
}
