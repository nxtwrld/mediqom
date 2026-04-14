import { derived, get } from 'svelte/store';
import { documents } from '$lib/documents';
import { addDocument, updateDocument } from '$lib/documents/index';
import { DocumentType, type Document } from '$lib/documents/types.d';
import { logger } from '$lib/logging/logger';
import type { Appointment, AppointmentsDocumentContent } from './types.d';
import { extractAppointments } from './extractor';

const APPOINTMENTS_DOC_VERSION = 1;

/**
 * Get the appointments document for a profile from the documents store.
 */
export function getAppointmentsDocument(profileId: string): Document | undefined {
  const allDocs = get(documents);
  return allDocs.find(
    (d) => d.user_id === profileId && d.type === DocumentType.appointments && (d as Document).content,
  ) as Document | undefined;
}

/**
 * Get appointments for a profile.
 */
export function getAppointments(profileId: string): Appointment[] {
  const doc = getAppointmentsDocument(profileId);
  if (!doc) return [];
  const content = doc.content as unknown as AppointmentsDocumentContent;
  return content?.appointments || [];
}

/**
 * Derived store for appointments of a specific profile.
 */
export function appointmentsByProfile(profileId: string) {
  return derived(documents, ($docs) => {
    const doc = $docs.find(
      (d) => d.user_id === profileId && d.type === DocumentType.appointments && (d as Document).content,
    ) as Document | undefined;
    if (!doc) return [];
    const content = doc.content as unknown as AppointmentsDocumentContent;
    return content?.appointments || [];
  });
}

/**
 * Save appointments to the profile's appointments document.
 */
async function saveAppointments(
  profileId: string,
  appointments: Appointment[],
): Promise<void> {
  const content: AppointmentsDocumentContent = {
    title: 'Appointments',
    tags: ['appointments', 'calendar'],
    appointments,
    version: APPOINTMENTS_DOC_VERSION,
  };

  const existingDoc = getAppointmentsDocument(profileId);

  if (existingDoc) {
    await updateDocument({
      ...existingDoc,
      content: content as any,
    });
  } else {
    await addDocument({
      type: DocumentType.appointments,
      user_id: profileId,
      content: content as any,
    });
  }
}

/**
 * Process a document to extract appointments and merge them.
 */
export async function processDocumentForAppointments(
  profileId: string,
  documentId: string,
  content: Record<string, any>,
  documentDate?: string,
): Promise<void> {
  try {
    const extracted = extractAppointments(content, documentId, documentDate);
    if (extracted.length === 0) return;

    const existing = getAppointments(profileId);
    let updated = [...existing];
    let changed = false;

    for (const candidate of extracted) {
      // Dedup: check if appointment from same source document with same type already exists
      const duplicate = updated.find(
        (a) =>
          a.sourceDocumentId === candidate.sourceDocumentId &&
          a.appointmentType === candidate.appointmentType &&
          a.title === candidate.title,
      );

      if (!duplicate) {
        updated.push(candidate);
        changed = true;
      }
    }

    if (changed) {
      await saveAppointments(profileId, updated);
      logger.documents.info('Appointments updated from document', {
        profileId,
        documentId,
        extractedCount: extracted.length,
        totalAppointments: updated.length,
      });
    }
  } catch (error) {
    logger.documents.warn('Failed to process document for appointments', {
      profileId,
      documentId,
      error,
    });
  }
}

/**
 * Update an appointment by ID.
 */
export async function updateAppointment(
  profileId: string,
  appointmentId: string,
  updates: Partial<Appointment>,
): Promise<void> {
  const existing = getAppointments(profileId);
  const index = existing.findIndex((a) => a.id === appointmentId);
  if (index < 0) return;

  const updated = [...existing];
  updated[index] = {
    ...updated[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await saveAppointments(profileId, updated);
}

/**
 * Confirm an appointment with a specific date.
 */
export async function confirmAppointment(
  profileId: string,
  appointmentId: string,
  dateTime: string,
): Promise<void> {
  await updateAppointment(profileId, appointmentId, {
    dateTime,
    timeframe: undefined,
    status: 'confirmed',
    synced: false,
  });
}

/**
 * Dismiss an appointment.
 */
export async function dismissAppointment(
  profileId: string,
  appointmentId: string,
): Promise<void> {
  await updateAppointment(profileId, appointmentId, {
    status: 'dismissed',
  });
}

/**
 * Mark an appointment as synced to calendar.
 */
export async function markAppointmentSynced(
  profileId: string,
  appointmentId: string,
  nativeEventId?: string,
): Promise<void> {
  await updateAppointment(profileId, appointmentId, {
    synced: true,
    nativeEventId,
    lastSyncedAt: new Date().toISOString(),
  });
}
