import { prefixes, suffixes } from '$lib/profiles/honorificTitles';
import type { ProviderContact } from './types.d';

const honorificSet = new Set([...prefixes, ...suffixes]);

/**
 * Normalize a name for comparison by stripping honorifics,
 * punctuation, and converting to lowercase.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-]/g, ' ')
    .split(/\s+/)
    .filter((word) => !honorificSet.has(word.replace(/\./g, '')))
    .join(' ')
    .trim();
}

/**
 * Normalize an institution name for comparison.
 */
function normalizeInstitution(name?: string): string {
  if (!name) return '';
  return name.toLowerCase().replace(/[.,\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface DeduplicateResult {
  /** Index of the existing contact that matches, or -1 if new */
  matchIndex: number;
  /** Confidence of the match: 'exact', 'high', 'none' */
  confidence: 'exact' | 'high' | 'none';
}

/**
 * Find a matching contact in the existing list.
 *
 * Match rules (in priority order):
 * 1. Same licenseNumber → exact match
 * 2. Same normalized name + same institution → exact match
 * 3. Same normalized name + matching phone or email → high match
 * 4. Same normalized name (no institution info) → high match
 */
export function findMatch(
  candidate: ProviderContact,
  existing: ProviderContact[],
): DeduplicateResult {
  const candidateName = normalizeName(candidate.vcard.fn || '');
  const candidateInst = normalizeInstitution(candidate.performer.institution?.name);
  const candidateLicense = candidate.performer.licenseNumber?.trim();
  const candidatePhone = candidate.vcard.tel?.[0]?.value?.replace(/\s/g, '');
  const candidateEmail = candidate.vcard.email?.[0]?.value?.toLowerCase();

  for (let i = 0; i < existing.length; i++) {
    const ex = existing[i];

    // Rule 1: License number match
    if (candidateLicense && ex.performer.licenseNumber?.trim() === candidateLicense) {
      return { matchIndex: i, confidence: 'exact' };
    }

    const exName = normalizeName(ex.vcard.fn || '');
    if (!candidateName || !exName || candidateName !== exName) continue;

    // Name matches - check supporting signals
    const exInst = normalizeInstitution(ex.performer.institution?.name);

    // Rule 2: Same name + same institution
    if (candidateInst && exInst && candidateInst === exInst) {
      return { matchIndex: i, confidence: 'exact' };
    }

    // Rule 3: Same name + phone or email match
    const exPhone = ex.vcard.tel?.[0]?.value?.replace(/\s/g, '');
    const exEmail = ex.vcard.email?.[0]?.value?.toLowerCase();

    if (candidatePhone && exPhone && candidatePhone === exPhone) {
      return { matchIndex: i, confidence: 'high' };
    }
    if (candidateEmail && exEmail && candidateEmail === exEmail) {
      return { matchIndex: i, confidence: 'high' };
    }

    // Rule 4: Same name, no institution info on either side
    if (!candidateInst && !exInst) {
      return { matchIndex: i, confidence: 'high' };
    }

    // Same name, different institutions → no match (different person at different place)
  }

  return { matchIndex: -1, confidence: 'none' };
}

/**
 * Merge a new contact into an existing one.
 * Preserves user-edited fields on the existing contact.
 * Updates non-edited fields with newer data.
 */
export function mergeContact(
  existing: ProviderContact,
  incoming: ProviderContact,
): ProviderContact {
  // Never overwrite user-edited contacts
  if (existing.userEdited) {
    // Only add the source document reference
    const sourceDocuments = [...new Set([...existing.sourceDocuments, ...incoming.sourceDocuments])];
    return {
      ...existing,
      sourceDocuments,
      lastSeen: incoming.lastSeen && (!existing.lastSeen || incoming.lastSeen > existing.lastSeen)
        ? incoming.lastSeen
        : existing.lastSeen,
      updatedAt: new Date().toISOString(),
    };
  }

  // Merge: prefer incoming data for empty fields, keep existing for populated fields
  const merged: ProviderContact = {
    ...existing,
    vcard: {
      ...existing.vcard,
      fn: incoming.vcard.fn || existing.vcard.fn,
      n: incoming.vcard.n || existing.vcard.n,
      org: incoming.vcard.org || existing.vcard.org,
      title: incoming.vcard.title || existing.vcard.title,
      tel: incoming.vcard.tel?.length ? incoming.vcard.tel : existing.vcard.tel,
      email: incoming.vcard.email?.length ? incoming.vcard.email : existing.vcard.email,
      adr: incoming.vcard.adr?.length ? incoming.vcard.adr : existing.vcard.adr,
      specialty: incoming.vcard.specialty?.length
        ? [...new Set([...(existing.vcard.specialty || []), ...incoming.vcard.specialty])]
        : existing.vcard.specialty,
    },
    performer: {
      ...existing.performer,
      role: incoming.performer.role || existing.performer.role,
      specialty: incoming.performer.specialty || existing.performer.specialty,
      licenseNumber: incoming.performer.licenseNumber || existing.performer.licenseNumber,
      institution: {
        ...existing.performer.institution,
        ...Object.fromEntries(
          Object.entries(incoming.performer.institution || {}).filter(([, v]) => v),
        ),
      },
    },
    sourceDocuments: [...new Set([...existing.sourceDocuments, ...incoming.sourceDocuments])],
    lastSeen: incoming.lastSeen && (!existing.lastSeen || incoming.lastSeen > existing.lastSeen)
      ? incoming.lastSeen
      : existing.lastSeen,
    updatedAt: new Date().toISOString(),
  };

  return merged;
}
