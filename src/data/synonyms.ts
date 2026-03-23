import { resolveSignalName, CANONICAL_KEYS } from './signal-catalog';

/**
 * Normalize a lab term to its canonical signal key.
 * Returns the canonical key (e.g., "hemoglobin") or null if not found.
 *
 * Note: Previously returned display names (e.g., "Hemoglobin").
 * Now returns canonical snake_case keys via the signal catalog.
 */
export default function (term: string): string | null {
	if (!term) return null;

	const resolved = resolveSignalName(term);

	// resolveSignalName returns the input as-is for unknowns,
	// so check if it actually resolved to a known key
	if (CANONICAL_KEYS.has(resolved)) {
		return resolved;
	}

	return null;
}
