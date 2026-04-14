import type { ProviderContact } from './types.d';
import type { VCard } from '$lib/contact/types.d';

/**
 * Convert a ProviderContact to VCard 4.0 text format (RFC 6350).
 */
export function toVCardText(contact: ProviderContact): string {
  const v = contact.vcard;
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:4.0',
  ];

  // FN (required)
  lines.push(`FN:${escapeVCard(v.fn || 'Unknown')}`);

  // N
  if (v.n) {
    const n = [
      v.n.familyName || '',
      v.n.givenName || '',
      v.n.additionalName || '',
      v.n.honorificPrefix || '',
      v.n.honorificSufix || '',
    ].map(escapeVCard);
    lines.push(`N:${n.join(';')}`);
  }

  // ORG
  if (v.org) {
    lines.push(`ORG:${escapeVCard(v.org)}`);
  }

  // TITLE
  if (v.title) {
    lines.push(`TITLE:${escapeVCard(v.title)}`);
  }

  // TEL
  if (v.tel) {
    for (const tel of v.tel) {
      if (tel.value) {
        const type = tel.type ? `;TYPE=${tel.type.toUpperCase()}` : '';
        lines.push(`TEL${type}:${escapeVCard(tel.value)}`);
      }
    }
  }

  // EMAIL
  if (v.email) {
    for (const email of v.email) {
      if (email.value) {
        const type = email.type ? `;TYPE=${email.type.toUpperCase()}` : '';
        lines.push(`EMAIL${type}:${escapeVCard(email.value)}`);
      }
    }
  }

  // ADR
  if (v.adr) {
    for (const adr of v.adr) {
      const parts = [
        '', // PO Box
        '', // Extended address
        adr.streetAddress || '',
        adr.locality || '',
        adr.region || '',
        adr.postalCode || '',
        adr.countryName || '',
      ].map(escapeVCard);
      lines.push(`ADR:${parts.join(';')}`);
    }
  }

  // CATEGORIES (specialty)
  if (v.specialty?.length) {
    lines.push(`CATEGORIES:${v.specialty.map(escapeVCard).join(',')}`);
  }

  // NOTE with role and institution details
  const notes: string[] = [];
  if (contact.performer.role) {
    notes.push(`Role: ${contact.performer.role.replace(/_/g, ' ')}`);
  }
  if (contact.performer.institution?.department) {
    notes.push(`Department: ${contact.performer.institution.department}`);
  }
  if (contact.performer.licenseNumber) {
    notes.push(`License: ${contact.performer.licenseNumber}`);
  }
  if (notes.length) {
    lines.push(`NOTE:${escapeVCard(notes.join('\\n'))}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/**
 * Generate a VCard file for multiple contacts.
 */
export function toVCardBatch(contacts: ProviderContact[]): string {
  return contacts.map(toVCardText).join('\r\n');
}

/**
 * Trigger a VCard file download in the browser.
 */
export function downloadVCard(contact: ProviderContact): void {
  const text = toVCardText(contact);
  const name = (contact.vcard.fn || 'contact').replace(/[^a-zA-Z0-9]/g, '_');
  const blob = new Blob([text], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Escape special characters for VCard format.
 */
function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
