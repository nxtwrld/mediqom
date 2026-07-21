import type { Document, DocumentNew } from '$lib/documents/types.d';

// Reuse form/route enums from the medications configuration
export type MedicationForm = 'tablet' | 'capsule' | 'sublingual' | 'liquid' | 'inhaler' | 'spray' | 'topical' | 'patch' | 'injection' | 'suppository' | 'cream' | 'ointment' | 'gel' | 'drops' | 'powder';

export type MedicationRoute = 'oral' | 'sublingual' | 'nasal' | 'inhalation' | 'topical' | 'transdermal' | 'rectal' | 'intravenous' | 'intramuscular' | 'subcutaneous' | 'ophthalmic' | 'otic' | 'vaginal' | 'buccal';

export type MedicationFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'as_needed';

export type MedicationStatus = 'active' | 'paused' | 'completed' | 'discontinued' | 'on_hold' | 'unknown';

export type AdherenceStatus = 'taken' | 'missed' | 'skipped' | 'pending';

export type AdherenceLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export type MedicationChangeType = 'new' | 'modified' | 'discontinued' | 'continued';

export interface MedicationSchedule {
    frequency: MedicationFrequency;
    times: string[];           // ["08:00", "14:00", "20:00"]
    byDay?: string[];          // ["MO", "WE", "FR"] for weekly
    byMonthDay?: number[];     // [1, 15] for monthly
    startDate: string;         // ISO date
    endDate?: string;          // ISO date, null = ongoing
    pillCount?: number;        // total supply
    refills?: number;
}

export interface AdherenceRecord {
    date: string;              // ISO date
    scheduledTime: string;     // "08:00"
    status: AdherenceStatus;
    takenAt?: string;          // actual time taken
    notes?: string;
}

export interface MedicationInstructions {
    administration?: string;
    specialInstructions?: string;
    asNeeded?: boolean;
    prnIndication?: string;
    notes?: string;
}

export interface MedicationDuration {
    days?: number;
    quantity?: string;
    refills?: number;
    daysSupply?: number;
}

/**
 * Unified Medication interface.
 * AI-extractable fields use names matching the AI extraction schema.
 * App-only fields (schedule, adherence tracking) are NOT in the AI schema.
 */
export interface Medication {
    // ── AI-extractable fields (match AI schema field names) ──
    medicationName: string;
    genericName?: string;
    brandName?: string;
    strength?: string;
    dosage: string;
    route: MedicationRoute;
    form: MedicationForm;
    indication?: string;
    therapeuticClass?: string[];
    searchTerms?: string[];
    prescriber?: string;
    notes?: string;
    prescriptionDate?: string;
    lastFilled?: string;
    adherenceLevel?: AdherenceLevel;
    sideEffects?: string[];
    instructions?: MedicationInstructions;
    duration?: MedicationDuration;
    // Doctor's authorial intent at time of source document. Never inferred — only set when the source
    // document explicitly described this as a new prescription, a change, or a discontinuation.
    changeType?: MedicationChangeType;

    // ── App-only fields (NOT in AI schema, populated by user/app) ──
    status: MedicationStatus;
    schedule: MedicationSchedule;
    adherence: { confirmations: AdherenceRecord[] };
    sourceDocumentId?: string;
    sourceDocumentDate?: string;
}

export interface MedicationDocumentContent {
    title: string;
    tags: string[];
    category: 'medication';
    medication: Medication;
    status: MedicationStatus;   // convenience mirror of medication.status
}

/** A medication document is a Document whose content is MedicationDocumentContent */
export type MedicationDocument = Omit<Document, 'content'> & {
    content: MedicationDocumentContent;
    subtype: 'medication';
};

export interface MedicationOccurrence {
    medicationId: string;
    medicationName: string;
    dosage: string;
    form: MedicationForm;
    scheduledTime: string;     // "08:00"
    scheduledDate: string;     // ISO date
    status: AdherenceStatus;
    takenAt?: string;
}

/** Enum arrays for building translated dropdown options */
export const MEDICATION_FORMS: MedicationForm[] = ['tablet', 'capsule', 'sublingual', 'liquid', 'inhaler', 'spray', 'topical', 'patch', 'injection', 'suppository', 'cream', 'ointment', 'gel', 'drops', 'powder'];

export const MEDICATION_ROUTES: MedicationRoute[] = ['oral', 'sublingual', 'nasal', 'inhalation', 'topical', 'transdermal', 'rectal', 'intravenous', 'intramuscular', 'subcutaneous', 'ophthalmic', 'otic', 'vaginal', 'buccal'];

export const MEDICATION_FREQUENCIES: MedicationFrequency[] = ['once', 'daily', 'weekly', 'monthly', 'as_needed'];

export const MEDICATION_STATUSES: MedicationStatus[] = ['active', 'paused', 'completed', 'discontinued', 'on_hold', 'unknown'];
