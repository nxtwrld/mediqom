import type { VCard } from '$lib/contact/types.d';
import type { ProviderContact, ProviderPerformer } from './types.d';

/**
 * Extract provider contacts from document content.
 * Scans performer arrays, referrals, and follow-up schedules.
 */
export function extractProviderContacts(
  content: Record<string, any>,
  documentId: string,
  documentDate?: string,
): ProviderContact[] {
  const contacts: ProviderContact[] = [];
  const now = new Date().toISOString();

  // Extract from top-level performer/performers field
  const performers = extractPerformers(content);
  for (const perf of performers) {
    const contact = performerToContact(perf, documentId, documentDate, now);
    if (contact) contacts.push(contact);
  }

  // Extract from recommendations
  if (content.recommendations) {
    const recs = Array.isArray(content.recommendations)
      ? content.recommendations
      : content.recommendations?.recommendations;

    if (Array.isArray(recs)) {
      for (const rec of recs) {
        // Referral provider
        if (rec.referralTo?.provider) {
          const contact = performerToContact(rec.referralTo.provider, documentId, documentDate, now);
          if (contact) contacts.push(contact);
        }
      }
    }
  }

  // Extract from followUpSchedule
  const schedule = content.followUpSchedule || content.recommendations?.followUpSchedule;
  if (Array.isArray(schedule)) {
    for (const item of schedule) {
      if (item.withProvider) {
        const contact = performerToContact(item.withProvider, documentId, documentDate, now);
        if (contact) contacts.push(contact);
      }
    }
  }

  // Scan all sections for performer data
  for (const [key, value] of Object.entries(content)) {
    if (key === 'recommendations' || key === 'followUpSchedule') continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Check for nested performer/performers in section data
      const sectionPerformers = extractPerformers(value);
      for (const perf of sectionPerformers) {
        const contact = performerToContact(perf, documentId, documentDate, now);
        if (contact) contacts.push(contact);
      }
    }
  }

  return contacts;
}

/**
 * Extract performer objects from a content object.
 * Handles both single performer and performers arrays.
 */
function extractPerformers(obj: Record<string, any>): Record<string, any>[] {
  const result: Record<string, any>[] = [];

  if (obj.performer && typeof obj.performer === 'object' && obj.performer.name) {
    result.push(obj.performer);
  }
  if (Array.isArray(obj.performers)) {
    for (const p of obj.performers) {
      if (p && typeof p === 'object' && p.name) {
        result.push(p);
      }
    }
  }

  return result;
}

/**
 * Convert a raw performer object from document content into a ProviderContact.
 * Returns null if the performer has no usable name.
 */
function performerToContact(
  perf: Record<string, any>,
  documentId: string,
  documentDate: string | undefined,
  now: string,
): ProviderContact | null {
  const name = perf.name?.trim();
  if (!name) return null;

  const vcard: VCard = {
    fn: [perf.title, name].filter(Boolean).join(' '),
    n: {
      honorificPrefix: perf.title,
      givenName: '',
      familyName: name,
    },
    org: perf.institution?.name,
    specialty: perf.specialty ? [perf.specialty] : undefined,
    tel: perf.institution?.phone ? [{ type: 'work', value: perf.institution.phone }] : undefined,
    email: perf.institution?.email ? [{ type: 'work', value: perf.institution.email }] : undefined,
    adr: perf.institution?.address
      ? [{ streetAddress: perf.institution.address }]
      : undefined,
  };

  // Try to split name into given/family
  const nameParts = name.split(/\s+/);
  if (nameParts.length >= 2) {
    vcard.n = {
      honorificPrefix: perf.title,
      givenName: nameParts[0],
      familyName: nameParts.slice(1).join(' '),
    };
  }

  const performer: ProviderPerformer = {
    role: perf.role || 'other_specialist',
    specialty: perf.specialty,
    licenseNumber: perf.licenseNumber,
    institution: perf.institution
      ? {
          name: perf.institution.name,
          department: perf.institution.department,
          address: perf.institution.address,
          phone: perf.institution.phone,
          email: perf.institution.email,
        }
      : undefined,
  };

  return {
    id: crypto.randomUUID(),
    vcard,
    performer,
    sourceDocuments: [documentId],
    lastSeen: documentDate || perf.datePerformed,
    createdAt: now,
    updatedAt: now,
    userEdited: false,
    syncedToDevice: false,
  };
}
