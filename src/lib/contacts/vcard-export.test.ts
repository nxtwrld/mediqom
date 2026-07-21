import { describe, it, expect } from 'vitest';
import { toVCardText, toVCardBatch } from './vcard-export';
import type { ProviderContact } from './types.d';

function makeContact(overrides: Partial<ProviderContact> = {}): ProviderContact {
  return {
    id: 'c-1',
    vcard: {
      fn: 'Dr. John Smith',
      n: {
        familyName: 'Smith',
        givenName: 'John',
        honorificPrefix: 'Dr.',
      },
      ...overrides.vcard,
    },
    performer: {
      role: 'cardiologist',
      ...overrides.performer,
    },
    sourceDocuments: ['doc-1'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    userEdited: false,
    syncedToDevice: false,
    ...overrides,
  };
}

describe('toVCardText', () => {
  it('generates valid VCard 4.0 structure', () => {
    const text = toVCardText(makeContact());
    expect(text).toContain('BEGIN:VCARD');
    expect(text).toContain('VERSION:4.0');
    expect(text).toContain('END:VCARD');
  });

  it('includes FN field', () => {
    const text = toVCardText(makeContact());
    expect(text).toContain('FN:Dr. John Smith');
  });

  it('includes N field with components', () => {
    const text = toVCardText(makeContact());
    expect(text).toContain('N:Smith;John;;Dr.;');
  });

  it('includes ORG field', () => {
    const text = toVCardText(
      makeContact({ vcard: { fn: 'Test', org: 'City Hospital' } }),
    );
    expect(text).toContain('ORG:City Hospital');
  });

  it('includes TEL field with type', () => {
    const text = toVCardText(
      makeContact({
        vcard: { fn: 'Test', tel: [{ type: 'work', value: '+1-555-1234' }] },
      }),
    );
    expect(text).toContain('TEL;TYPE=WORK:+1-555-1234');
  });

  it('includes EMAIL field with type', () => {
    const text = toVCardText(
      makeContact({
        vcard: { fn: 'Test', email: [{ type: 'work', value: 'doc@hospital.com' }] },
      }),
    );
    expect(text).toContain('EMAIL;TYPE=WORK:doc@hospital.com');
  });

  it('includes ADR field', () => {
    const text = toVCardText(
      makeContact({
        vcard: {
          fn: 'Test',
          adr: [{ streetAddress: '123 Main St', locality: 'Springfield', postalCode: '12345' }],
        },
      }),
    );
    expect(text).toContain('ADR:;;123 Main St;Springfield;;12345;');
  });

  it('includes CATEGORIES for specialties', () => {
    const text = toVCardText(
      makeContact({
        vcard: { fn: 'Test', specialty: ['Cardiology', 'Internal Medicine'] },
      }),
    );
    // Commas in CATEGORIES are escaped per VCard spec
    expect(text).toContain('CATEGORIES:Cardiology,Internal Medicine');
  });

  it('includes NOTE with role and license', () => {
    const text = toVCardText(
      makeContact({
        performer: {
          role: 'cardiologist',
          licenseNumber: 'LIC-001',
          institution: { department: 'Cardiology Dept' },
        },
      }),
    );
    expect(text).toContain('NOTE:');
    expect(text).toContain('Role: cardiologist');
    expect(text).toContain('License: LIC-001');
    expect(text).toContain('Department: Cardiology Dept');
  });

  it('handles contact with minimal data', () => {
    const text = toVCardText(
      makeContact({
        vcard: { fn: 'Jane' },
        performer: { role: 'other_specialist' },
      }),
    );
    expect(text).toContain('BEGIN:VCARD');
    expect(text).toContain('FN:Jane');
    expect(text).toContain('END:VCARD');
  });

  it('escapes semicolons and commas', () => {
    const text = toVCardText(
      makeContact({
        vcard: { fn: 'Smith, John; MD' },
      }),
    );
    expect(text).toContain('FN:Smith\\, John\\; MD');
  });

  it('omits TEL without type gracefully', () => {
    const text = toVCardText(
      makeContact({
        vcard: { fn: 'Test', tel: [{ value: '+1234' }] },
      }),
    );
    expect(text).toContain('TEL:+1234');
  });

  it('skips empty tel and email entries', () => {
    const text = toVCardText(
      makeContact({
        vcard: { fn: 'Test', tel: [{ type: 'work' }], email: [{ type: 'work' }] },
      }),
    );
    expect(text).not.toContain('TEL');
    expect(text).not.toContain('EMAIL');
  });
});

describe('toVCardBatch', () => {
  it('generates multiple vcards separated by CRLF', () => {
    const contacts = [
      makeContact({ id: 'c-1', vcard: { fn: 'Doctor A' } }),
      makeContact({ id: 'c-2', vcard: { fn: 'Doctor B' } }),
    ];
    const text = toVCardBatch(contacts);
    const cards = text.split('BEGIN:VCARD').filter(Boolean);
    expect(cards).toHaveLength(2);
    expect(text).toContain('FN:Doctor A');
    expect(text).toContain('FN:Doctor B');
  });

  it('handles empty array', () => {
    const text = toVCardBatch([]);
    expect(text).toBe('');
  });
});
