import type { Medication } from './types';
import type { Document } from '$lib/documents/types.d';

/**
 * Convert an AI currentMedications item to a partial Medication.
 * changeType defaults to 'continued' — a current-medications list is the doctor confirming
 * the patient is still on this medication. Overridden to 'discontinued' if status says so.
 */
export function fromCurrentMedication(aiItem: any): Partial<Medication> {
	const status: Medication['status'] | undefined = aiItem.status;
	const changeType: Medication['changeType'] =
		status === 'discontinued' ? 'discontinued' : 'continued';
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
		...(status && { status }),
		...(aiItem.startDate && { schedule: { frequency: 'daily' as const, times: [], startDate: aiItem.startDate } }),
		changeType
	};
}

/**
 * Convert an AI newPrescriptions item to a partial Medication.
 * changeType is 'new' — this array only contains explicitly newly-prescribed medications.
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
		changeType: 'new'
	};
}

/**
 * Convert an AI medicationChanges item to a partial Medication.
 * changeType is 'modified' for dose/frequency/switch changes, 'discontinued' if the change is a stop.
 * Carries the new dose as the active dosage. The full change provenance (previousDose, reason,
 * effectiveDate) lives on the source document's content.medications.medicationChanges[] entry
 * and is rendered with localisation by SectionMedications.svelte.
 */
export function fromMedicationChange(aiItem: any): Partial<Medication> {
	const isDiscontinuation = aiItem.changeType === 'discontinued';
	const dosageFromChange = aiItem.newDose || aiItem.previousDose;
	return {
		medicationName: aiItem.medicationName,
		...(dosageFromChange && { dosage: dosageFromChange }),
		...(aiItem.effectiveDate && { prescriptionDate: aiItem.effectiveDate }),
		...(isDiscontinuation && { status: 'discontinued' as const }),
		changeType: isDiscontinuation ? 'discontinued' : 'modified'
	};
}

/**
 * Convert an AI discontinuedMedications item to a partial Medication.
 * changeType is 'discontinued'. The doctor explicitly stopped this medication.
 * Reason, prescriber, and dateDiscontinued remain on the source document's
 * content.medications.discontinuedMedications[] entry for localised rendering.
 */
export function fromDiscontinuedMedication(aiItem: any): Partial<Medication> {
	return {
		medicationName: aiItem.medicationName,
		...(aiItem.dateDiscontinued && { prescriptionDate: aiItem.dateDiscontinued }),
		...(aiItem.prescriber && { prescriber: aiItem.prescriber }),
		status: 'discontinued',
		changeType: 'discontinued'
	};
}

/**
 * Extract medication items from a document's medications content section.
 * Walks all four extraction arrays (currentMedications, newPrescriptions, medicationChanges,
 * discontinuedMedications) so the Care Plan merge phase sees the doctor's full authorial intent.
 * Sets sourceDocumentId on each extracted medication.
 */
export function extractMedicationsFromDocument(doc: Document): Partial<Medication>[] {
	const meds = (doc.content as any)?.medications;
	if (!meds) return [];
	const results: Partial<Medication>[] = [];

	const docDate = (doc as any).metadata?.date || (doc.content as any)?.date;
	const provenance = { sourceDocumentId: doc.id, ...(docDate && { sourceDocumentDate: docDate }) };

	for (const item of meds.currentMedications || []) {
		results.push({ ...fromCurrentMedication(item), ...provenance });
	}
	for (const item of meds.newPrescriptions || []) {
		results.push({ ...fromNewPrescription(item), ...provenance });
	}
	for (const item of meds.medicationChanges || []) {
		results.push({ ...fromMedicationChange(item), ...provenance });
	}
	for (const item of meds.discontinuedMedications || []) {
		results.push({ ...fromDiscontinuedMedication(item), ...provenance });
	}
	return results;
}
