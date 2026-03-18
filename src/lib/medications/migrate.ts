import type { MedicationDocumentContent } from './types';

/**
 * Migrate old medication document content structure to the current format.
 *
 * Old structure had `schedule`, `adherence`, and `status` at the top level of content,
 * and used `medication.name` instead of `medication.medicationName`.
 *
 * New structure nests everything inside `content.medication`.
 *
 * @returns true if migration was performed
 */
export function migrateMedicationContent(content: Record<string, any>): boolean {
	if (!content || !content.medication) return false;

	let migrated = false;

	// Move top-level schedule into medication
	if (content.schedule && !content.medication.schedule) {
		content.medication.schedule = content.schedule;
		delete content.schedule;
		migrated = true;
	}

	// Move top-level adherence into medication
	if (content.adherence && !content.medication.adherence) {
		content.medication.adherence = content.adherence;
		delete content.adherence;
		migrated = true;
	}

	// Rename medication.name → medication.medicationName
	if (content.medication.name && !content.medication.medicationName) {
		content.medication.medicationName = content.medication.name;
		delete content.medication.name;
		migrated = true;
	}

	// Ensure medication.status is set from top-level status
	if (content.status && !content.medication.status) {
		content.medication.status = content.status;
		migrated = true;
	}

	return migrated;
}
