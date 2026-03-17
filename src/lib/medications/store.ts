import { derived, get } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { documents, loadDocument } from '$lib/documents';
import { addDocument, updateDocument, removeDocument } from '$lib/documents';
import { DocumentType, type Document, type DocumentNew } from '$lib/documents/types.d';
import type {
	MedicationDocument,
	MedicationDocumentContent,
	Medication,
	MedicationOccurrence,
	MedicationSchedule,
	MedicationStatus
} from './types';
import { extractMedicationsFromDocument } from './convert';
import { calculateAllOccurrences } from './occurrences';
import { migrateMedicationContent } from './migrate';

/**
 * Get the Monday of the current week.
 */
function getStartOfWeek(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	const day = d.getDay();
	const diff = (day === 0 ? -6 : 1) - day;
	d.setDate(d.getDate() + diff);
	return d;
}

/**
 * Derived store: all medication documents for a given profile.
 */
export function medicationsByProfile(profileId: string): Readable<MedicationDocument[]> {
	return derived(documents, ($docs) => {
		return $docs
			.filter(
				(doc): doc is MedicationDocument =>
					(doc.metadata?.category === 'medication' || doc.subtype === 'medication') &&
					doc.user_id === profileId &&
					!!doc.content
			);
	});
}

/**
 * Derived store: all active medications for a profile.
 */
export function activeMedicationsByProfile(profileId: string): Readable<MedicationDocument[]> {
	return derived(medicationsByProfile(profileId), ($meds) => {
		return $meds.filter((m) => m.content.status === 'active');
	});
}

/**
 * Get today's medication schedule for a profile.
 */
export function todaySchedule(profileId: string) {
	return derived(activeMedicationsByProfile(profileId), ($meds) => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);
		return calculateAllOccurrences($meds, today, tomorrow);
	});
}

/**
 * Get the week's medication schedule for a profile (Mon–Sun).
 */
export function weekSchedule(profileId: string): Readable<MedicationOccurrence[]> {
	return derived(activeMedicationsByProfile(profileId), ($meds) => {
		const start = getStartOfWeek(new Date());
		const end = new Date(start);
		end.setDate(end.getDate() + 7);
		return calculateAllOccurrences($meds, start, end);
	});
}

/**
 * Derived store: medications extracted from imported documents (non-medication docs with medication sections).
 */
export function extractedMedicationsByProfile(profileId: string): Readable<Partial<Medication>[]> {
	return derived(documents, ($docs) => {
		return $docs
			.filter((doc) =>
				doc.user_id === profileId &&
				doc.metadata?.category !== 'medication' &&
				!!doc.content &&
				(doc.metadata?.sections?.includes('medications') ||
				 doc.metadata?.sections?.includes('prescriptions'))
			)
			.flatMap((doc) => extractMedicationsFromDocument(doc as Document));
	});
}

/**
 * Load full content for documents that have medication sections but no content yet.
 */
export async function loadExtractedMedicationContent(profileId: string): Promise<void> {
	const $docs = get(documents);
	const medicationSectionPreloads = $docs.filter(
		(doc) =>
			doc.user_id === profileId &&
			doc.metadata?.category !== 'medication' &&
			!doc.content &&
			(doc.metadata?.sections?.includes('medications') ||
			 doc.metadata?.sections?.includes('prescriptions'))
	);
	if (medicationSectionPreloads.length === 0) return;
	await Promise.all(medicationSectionPreloads.map((doc) => loadDocument(doc.id, profileId)));
}

/**
 * Load full content for medication documents that only have metadata (DocumentPreload).
 */
export async function loadMedicationContent(profileId: string): Promise<void> {
	const $docs = get(documents);
	const medicationPreloads = $docs.filter(
		(doc) =>
			(doc.metadata?.category === 'medication' || doc.subtype === 'medication') &&
			doc.user_id === profileId &&
			!doc.content
	);
	if (medicationPreloads.length === 0) return;
	await Promise.all(medicationPreloads.map((doc) => loadDocument(doc.id, profileId)));

	// Migrate old medication content structure if needed
	const $docsAfterLoad = get(documents);
	const medicationDocs = $docsAfterLoad.filter(
		(doc) =>
			(doc.metadata?.category === 'medication' || doc.subtype === 'medication') &&
			doc.user_id === profileId &&
			!!doc.content
	);
	for (const doc of medicationDocs) {
		if (migrateMedicationContent(doc.content as Record<string, any>)) {
			await updateDocument(doc as Document);
		}
	}
}

/**
 * Create a new medication document.
 */
export async function addMedication(
	profileId: string,
	medication: Medication
): Promise<Document> {
	const content: MedicationDocumentContent = {
		title: medication.medicationName,
		tags: ['medication'],
		category: 'medication',
		medication,
		status: medication.status
	};

	const doc: DocumentNew = {
		type: DocumentType.document,
		content,
		user_id: profileId,
		subtype: 'medication'
	};

	return await addDocument(doc);
}

/**
 * Update an existing medication document.
 */
export async function updateMedication(
	medicationDoc: MedicationDocument,
	updates: Partial<Pick<MedicationDocumentContent, 'medication' | 'status'>>
): Promise<void> {
	const updatedContent = { ...medicationDoc.content };

	if (updates.medication) {
		updatedContent.medication = { ...updatedContent.medication, ...updates.medication };
		updatedContent.title = updatedContent.medication.medicationName;
	}
	if (updates.status !== undefined) {
		updatedContent.status = updates.status;
		updatedContent.medication = { ...updatedContent.medication, status: updates.status };
	}

	await updateDocument({
		...medicationDoc,
		content: updatedContent
	} as Document);
}

/**
 * Delete a medication document.
 */
export async function deleteMedication(medicationId: string): Promise<void> {
	await removeDocument(medicationId);
}

/**
 * Format schedule for display.
 * Accepts an optional translation function for i18n support.
 */
export function formatSchedule(
	schedule: MedicationSchedule,
	t?: (key: string) => string
): string {
	const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
	const parts: string[] = [];

	switch (schedule.frequency) {
		case 'once':
			parts.push(tr('medications.frequency-once', 'Once'));
			break;
		case 'daily':
			parts.push(tr('medications.frequency-daily', 'Daily'));
			break;
		case 'weekly':
			parts.push(tr('medications.frequency-weekly', 'Weekly'));
			if (schedule.byDay?.length) {
				const days = schedule.byDay.map((d) => tr(`medications.day-${d.toLowerCase()}`, d));
				parts.push(`(${days.join(', ')})`);
			}
			break;
		case 'monthly':
			parts.push(tr('medications.frequency-monthly', 'Monthly'));
			break;
		case 'as_needed':
			parts.push(tr('medications.frequency-as_needed', 'As needed'));
			break;
	}

	if (schedule.times.length > 0 && schedule.frequency !== 'as_needed') {
		parts.push(`${schedule.times.join(', ')}`);
	}

	return parts.join(' ');
}
