import { writable, derived, get } from 'svelte/store';
import { documents } from '$lib/documents';
import { addDocument, updateDocument } from '$lib/documents/index';
import { DocumentType, type Document, type DocumentPreload } from '$lib/documents/types.d';
import { logger } from '$lib/logging/logger';
import type { ProviderContact, ContactsDocumentContent } from './types.d';
import { extractProviderContacts } from './extractor';
import { findMatch, mergeContact } from './dedup';

const CONTACTS_DOC_VERSION = 1;

/**
 * Get the contacts document for a profile from the documents store.
 */
export function getContactsDocument(profileId: string): Document | undefined {
  const allDocs = get(documents);
  return allDocs.find(
    (d) => d.user_id === profileId && d.type === DocumentType.contacts && (d as Document).content,
  ) as Document | undefined;
}

/**
 * Get contacts for a profile from its contacts document.
 */
export function getContacts(profileId: string): ProviderContact[] {
  const doc = getContactsDocument(profileId);
  if (!doc) return [];
  const content = doc.content as unknown as ContactsDocumentContent;
  return content?.providers || [];
}

/**
 * Derived store that provides contacts for a specific profile.
 */
export function contactsByProfile(profileId: string) {
  return derived(documents, ($docs) => {
    const doc = $docs.find(
      (d) => d.user_id === profileId && d.type === DocumentType.contacts && (d as Document).content,
    ) as Document | undefined;
    if (!doc) return [];
    const content = doc.content as unknown as ContactsDocumentContent;
    return content?.providers || [];
  });
}

/**
 * Save contacts to the profile's contacts document.
 * Creates a new document if none exists, or updates existing.
 */
export async function saveContacts(
  profileId: string,
  providers: ProviderContact[],
): Promise<void> {
  const content: ContactsDocumentContent = {
    title: 'Provider Contacts',
    tags: ['contacts', 'providers'],
    providers,
    version: CONTACTS_DOC_VERSION,
  };

  const existingDoc = getContactsDocument(profileId);

  if (existingDoc) {
    await updateDocument({
      ...existingDoc,
      content: content as any,
    });
  } else {
    await addDocument({
      type: DocumentType.contacts,
      user_id: profileId,
      content: content as any,
    });
  }
}

/**
 * Process a document's content to extract and merge provider contacts.
 * Called after a document is added or loaded with full content.
 */
export async function processDocumentForContacts(
  profileId: string,
  documentId: string,
  content: Record<string, any>,
  documentDate?: string,
): Promise<void> {
  try {
    const extracted = extractProviderContacts(content, documentId, documentDate);
    if (extracted.length === 0) return;

    const existing = getContacts(profileId);
    let updated = [...existing];
    let changed = false;

    for (const candidate of extracted) {
      const result = findMatch(candidate, updated);

      if (result.matchIndex >= 0) {
        // Merge with existing contact
        const merged = mergeContact(updated[result.matchIndex], candidate);
        // Check if anything actually changed
        if (JSON.stringify(merged) !== JSON.stringify(updated[result.matchIndex])) {
          updated[result.matchIndex] = merged;
          changed = true;
        }
      } else {
        // New contact
        updated.push(candidate);
        changed = true;
      }
    }

    if (changed) {
      await saveContacts(profileId, updated);
      logger.documents.info('Contacts updated from document', {
        profileId,
        documentId,
        extractedCount: extracted.length,
        totalContacts: updated.length,
      });
    }
  } catch (error) {
    logger.documents.warn('Failed to process document for contacts', {
      profileId,
      documentId,
      error,
    });
  }
}

/**
 * Add a single contact manually.
 */
export async function addContact(
  profileId: string,
  contact: ProviderContact,
): Promise<void> {
  const existing = getContacts(profileId);
  await saveContacts(profileId, [...existing, contact]);
}

/**
 * Update a contact by ID.
 */
export async function updateContact(
  profileId: string,
  contactId: string,
  updates: Partial<ProviderContact>,
): Promise<void> {
  const existing = getContacts(profileId);
  const index = existing.findIndex((c) => c.id === contactId);
  if (index < 0) return;

  const updated = [...existing];
  updated[index] = {
    ...updated[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await saveContacts(profileId, updated);
}

/**
 * Remove a contact by ID.
 */
export async function removeContact(
  profileId: string,
  contactId: string,
): Promise<void> {
  const existing = getContacts(profileId);
  await saveContacts(profileId, existing.filter((c) => c.id !== contactId));
}

/**
 * Mark a contact as synced to device.
 */
export async function markContactSynced(
  profileId: string,
  contactId: string,
  deviceContactId?: string,
): Promise<void> {
  await updateContact(profileId, contactId, {
    syncedToDevice: true,
    deviceContactId,
    lastSyncedAt: new Date().toISOString(),
  });
}
