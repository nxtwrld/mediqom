/**
 * Auto-derived signal reference ranges from lab.properties.defaults.json.
 * For each signal with a referenceRange, picks the adult "any" sex range.
 * Format: "low-high" — same as document-extracted references.
 */
import labDefaults from '$data/lab.properties.defaults.json';

function buildDefaultReferences(): Record<string, string> {
	const refs: Record<string, string> = {};

	for (const [key, def] of Object.entries(labDefaults as Record<string, any>)) {
		if (!def.referenceRange || !Array.isArray(def.referenceRange) || def.referenceRange.length === 0) {
			continue;
		}

		// Prefer adult "any" sex range (ageRange.min >= 18)
		let match = def.referenceRange.find(
			(r: any) => r.sex === 'any' && r.ageRange?.min >= 18
		);

		// Fallback: any "any" sex range
		if (!match) {
			match = def.referenceRange.find((r: any) => r.sex === 'any');
		}

		// Last resort: first range
		if (!match) {
			match = def.referenceRange[0];
		}

		if (!match) continue;

		// Only include numeric ranges
		if (typeof match.low !== 'number') continue;
		if (match.high !== null && typeof match.high !== 'number') continue;

		if (match.high === null) {
			refs[key] = `${match.low}-`;
		} else if (match.low === match.high) {
			// Skip degenerate ranges (e.g. 0-0)
			continue;
		} else {
			refs[key] = `${match.low}-${match.high}`;
		}
	}

	return refs;
}

export const DEFAULT_SIGNAL_REFERENCES: Record<string, string> = buildDefaultReferences();
