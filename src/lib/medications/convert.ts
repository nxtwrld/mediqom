import type { Medication } from './types';
import type { Document } from '$lib/documents/types.d';

/**
 * Convert an AI currentMedications item to a partial Medication.
 */
export function fromCurrentMedication(aiItem: any): Partial<Medication> {
	return {
		medicationName: aiItem.medicationName,
		...(aiItem.genericName && { genericName: aiItem.genericName }),
		...(aiItem.brandName && { brandName: aiItem.brandName }),
		...(aiItem.strength && { strength: aiItem.strength }),
		...(aiItem.dosage && { dosage: aiItem.dosage }),
		...(aiItem.route && { route: aiItem.route }),
		...(aiItem.form && { form: aiItem.form }),
		...(aiItem.indication && { indication: aiItem.indication }),
		...(aiItem.prescriber && { prescriber: aiItem.prescriber }),
		...(aiItem.notes && { notes: aiItem.notes }),
		...(aiItem.lastFilled && { lastFilled: aiItem.lastFilled }),
		...(aiItem.adherence && { adherenceLevel: aiItem.adherence }),
		...(aiItem.sideEffects && { sideEffects: aiItem.sideEffects }),
		...(aiItem.therapeuticClass && { therapeuticClass: aiItem.therapeuticClass }),
		...(aiItem.searchTerms && { searchTerms: aiItem.searchTerms }),
		...(aiItem.status && { status: aiItem.status }),
		...(aiItem.startDate && { schedule: { frequency: 'daily' as const, times: [], startDate: aiItem.startDate } }),
	};
}

/**
 * Convert an AI newPrescriptions item to a partial Medication.
 */
export function fromNewPrescription(aiItem: any): Partial<Medication> {
	return {
		medicationName: aiItem.medicationName,
		...(aiItem.genericName && { genericName: aiItem.genericName }),
		...(aiItem.brandName && { brandName: aiItem.brandName }),
		...(aiItem.strength && { strength: aiItem.strength }),
		...(aiItem.dosage && { dosage: aiItem.dosage }),
		...(aiItem.route && { route: aiItem.route }),
		...(aiItem.form && { form: aiItem.form }),
		...(aiItem.indication && { indication: aiItem.indication }),
		...(aiItem.prescriptionDate && { prescriptionDate: aiItem.prescriptionDate }),
		...(aiItem.therapeuticClass && { therapeuticClass: aiItem.therapeuticClass }),
		...(aiItem.searchTerms && { searchTerms: aiItem.searchTerms }),
		...(aiItem.instructions && { instructions: aiItem.instructions }),
		...(aiItem.duration && { duration: aiItem.duration }),
		...(aiItem.prescriber?.name && { prescriber: aiItem.prescriber.name }),
	};
}

/**
 * Extract medication items from a document's medications content section.
 * Sets sourceDocumentId on each extracted medication.
 */
export function extractMedicationsFromDocument(doc: Document): Partial<Medication>[] {
	const meds = (doc.content as any)?.medications;
	if (!meds) return [];
	const results: Partial<Medication>[] = [];

	const docDate = (doc as any).metadata?.date || (doc.content as any)?.date;

	for (const item of meds.currentMedications || []) {
		results.push({ ...fromCurrentMedication(item), sourceDocumentId: doc.id, ...(docDate && { sourceDocumentDate: docDate }) });
	}
	for (const item of meds.newPrescriptions || []) {
		results.push({ ...fromNewPrescription(item), sourceDocumentId: doc.id, ...(docDate && { sourceDocumentDate: docDate }) });
	}
	return results;
}
