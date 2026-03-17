/**
 * Shared helper to derive section tags from document content.
 * Used by the import finalizer (new docs) and loadDocument (backfill existing docs).
 */
export function deriveSections(content: any): string[] {
	const sections: string[] = [];
	const featureFlags = content.featureDetectionResults || {};
	const flagToSection: Record<string, string> = {
		hasMedications: 'medications',
		hasPrescriptions: 'prescriptions',
		hasImmunizations: 'immunizations',
		hasSignals: 'signals',
		hasImaging: 'imaging',
		hasAllergies: 'allergies',
	};
	for (const [flag, section] of Object.entries(flagToSection)) {
		if (featureFlags[flag]) sections.push(section);
	}
	// Fallback: check actual content for medications
	if (!sections.includes('medications') && (
		content.medications?.hasMedications ||
		content.medications?.currentMedications?.length > 0 ||
		content.medications?.newPrescriptions?.length > 0
	)) {
		sections.push('medications');
	}
	return sections;
}
