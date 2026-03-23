/**
 * Auto-derived signal reference ranges from the unified signal catalog.
 * For each signal with a referenceRange, picks the adult "any" sex range.
 * Format: "low-high" — same as document-extracted references.
 */
import { getAllKeys, getDefaultReference } from '$data/signal-catalog';

function buildDefaultReferences(): Record<string, string> {
	const refs: Record<string, string> = {};

	for (const key of getAllKeys()) {
		const ref = getDefaultReference(key);
		if (ref) {
			// Skip degenerate ranges (e.g. 0-0)
			const parts = ref.split('-');
			if (parts.length === 2 && parts[0] === parts[1]) continue;
			refs[key] = ref;
		}
	}

	return refs;
}

export const DEFAULT_SIGNAL_REFERENCES: Record<string, string> = buildDefaultReferences();
