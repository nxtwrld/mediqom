import { describe, it, expect } from 'vitest';
import { normalizeName, findMatch, mergeContact } from './dedup';
import type { ProviderContact } from './types.d';

function makeContact(overrides: Partial<ProviderContact> = {}): ProviderContact {
  return {
    id: overrides.id ?? 'c-1',
    vcard: {
      fn: 'Dr. John Smith',
      ...overrides.vcard,
    },
    performer: {
      role: 'primary_physician',
      ...overrides.performer,
    },
    sourceDocuments: overrides.sourceDocuments ?? ['doc-1'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    userEdited: overrides.userEdited ?? false,
    syncedToDevice: overrides.syncedToDevice ?? false,
    ...overrides,
  };
}

describe('normalizeName', () => {
  it('strips honorific prefixes', () => {
    expect(normalizeName('Dr. John Smith')).toBe('john smith');
    expect(normalizeName('Prof. Jane Doe')).toBe('jane doe');
  });

  it('strips European academic titles', () => {
    expect(normalizeName('MUDr. Jan Novák')).toBe('jan novák');
    expect(normalizeName('Doc. PhDr. Karel Vlček')).toBe('karel vlček');
  });

  it('handles multiple titles and punctuation', () => {
    expect(normalizeName('Prof. Dr. Hans Müller')).toBe('hans müller');
  });

  it('lowercases everything', () => {
    expect(normalizeName('JOHN SMITH')).toBe('john smith');
  });

  it('handles empty and whitespace-only strings', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  it('replaces dots and dashes with spaces then strips titles', () => {
    expect(normalizeName('Dr. Fischer')).toBe('fischer');
  });
});

describe('findMatch', () => {
  it('returns no match for empty existing list', () => {
    const candidate = makeContact();
    const result = findMatch(candidate, []);
    expect(result).toEqual({ matchIndex: -1, confidence: 'none' });
  });

  it('matches by licenseNumber (exact)', () => {
    const candidate = makeContact({
      vcard: { fn: 'Different Name' },
      performer: { role: 'cardiologist', licenseNumber: 'LIC-12345' },
    });
    const existing = [
      makeContact({
        vcard: { fn: 'Dr. John Smith' },
        performer: { role: 'primary_physician', licenseNumber: 'LIC-12345' },
      }),
    ];
    const result = findMatch(candidate, existing);
    expect(result).toEqual({ matchIndex: 0, confidence: 'exact' });
  });

  it('matches by normalized name + institution (exact)', () => {
    const candidate = makeContact({
      vcard: { fn: 'Dr. John Smith' },
      performer: {
        role: 'cardiologist',
        institution: { name: 'City Hospital' },
      },
    });
    const existing = [
      makeContact({
        vcard: { fn: 'Prof. John Smith' },
        performer: {
          role: 'primary_physician',
          institution: { name: 'City Hospital' },
        },
      }),
    ];
    const result = findMatch(candidate, existing);
    expect(result).toEqual({ matchIndex: 0, confidence: 'exact' });
  });

  it('matches by normalized name + phone (high)', () => {
    const candidate = makeContact({
      vcard: {
        fn: 'Dr. John Smith',
        tel: [{ type: 'work', value: '+1 555 1234' }],
      },
    });
    const existing = [
      makeContact({
        vcard: {
          fn: 'John Smith',
          tel: [{ type: 'work', value: '+15551234' }],
        },
      }),
    ];
    const result = findMatch(candidate, existing);
    expect(result).toEqual({ matchIndex: 0, confidence: 'high' });
  });

  it('matches by normalized name + email (high)', () => {
    const candidate = makeContact({
      vcard: {
        fn: 'Dr. John Smith',
        email: [{ type: 'work', value: 'John.Smith@hospital.com' }],
      },
    });
    const existing = [
      makeContact({
        vcard: {
          fn: 'John Smith',
          email: [{ type: 'work', value: 'john.smith@hospital.com' }],
        },
      }),
    ];
    const result = findMatch(candidate, existing);
    expect(result).toEqual({ matchIndex: 0, confidence: 'high' });
  });

  it('matches by name alone when neither has institution (high)', () => {
    const candidate = makeContact({
      vcard: { fn: 'Dr. John Smith' },
      performer: { role: 'cardiologist' },
    });
    const existing = [
      makeContact({
        vcard: { fn: 'John Smith' },
        performer: { role: 'primary_physician' },
      }),
    ];
    const result = findMatch(candidate, existing);
    expect(result).toEqual({ matchIndex: 0, confidence: 'high' });
  });

  it('does not match same name with different institutions', () => {
    const candidate = makeContact({
      vcard: { fn: 'Dr. John Smith' },
      performer: {
        role: 'cardiologist',
        institution: { name: 'Hospital A' },
      },
    });
    const existing = [
      makeContact({
        vcard: { fn: 'John Smith' },
        performer: {
          role: 'primary_physician',
          institution: { name: 'Hospital B' },
        },
      }),
    ];
    const result = findMatch(candidate, existing);
    expect(result).toEqual({ matchIndex: -1, confidence: 'none' });
  });

  it('does not match different names', () => {
    const candidate = makeContact({
      vcard: { fn: 'Jane Doe' },
    });
    const existing = [
      makeContact({
        vcard: { fn: 'John Smith' },
      }),
    ];
    const result = findMatch(candidate, existing);
    expect(result).toEqual({ matchIndex: -1, confidence: 'none' });
  });

  it('finds match at correct index in multi-item list', () => {
    const candidate = makeContact({
      vcard: { fn: 'Dr. Jane Doe' },
      performer: { role: 'neurologist' },
    });
    const existing = [
      makeContact({ id: 'c-1', vcard: { fn: 'John Smith' } }),
      makeContact({ id: 'c-2', vcard: { fn: 'Jane Doe' } }),
      makeContact({ id: 'c-3', vcard: { fn: 'Bob Wilson' } }),
    ];
    const result = findMatch(candidate, existing);
    expect(result.matchIndex).toBe(1);
  });
});

describe('mergeContact', () => {
  it('preserves user-edited contacts, only updates source docs', () => {
    const existing = makeContact({
      userEdited: true,
      vcard: { fn: 'Custom Name' },
      sourceDocuments: ['doc-1'],
    });
    const incoming = makeContact({
      vcard: { fn: 'Dr. New Name' },
      sourceDocuments: ['doc-2'],
      lastSeen: '2026-06-01',
    });

    const merged = mergeContact(existing, incoming);
    expect(merged.vcard.fn).toBe('Custom Name');
    expect(merged.sourceDocuments).toContain('doc-1');
    expect(merged.sourceDocuments).toContain('doc-2');
    expect(merged.lastSeen).toBe('2026-06-01');
    expect(merged.userEdited).toBe(true);
  });

  it('merges non-edited contacts, preferring incoming data for empty fields', () => {
    const existing = makeContact({
      vcard: { fn: 'John Smith' },
      performer: { role: 'primary_physician' },
      sourceDocuments: ['doc-1'],
    });
    const incoming = makeContact({
      vcard: {
        fn: 'Dr. John Smith',
        org: 'City Hospital',
        tel: [{ type: 'work', value: '+1555' }],
      },
      performer: {
        role: 'cardiologist',
        specialty: 'Cardiology',
        institution: { name: 'City Hospital', phone: '+1555' },
      },
      sourceDocuments: ['doc-2'],
    });

    const merged = mergeContact(existing, incoming);
    expect(merged.vcard.org).toBe('City Hospital');
    expect(merged.vcard.tel).toEqual([{ type: 'work', value: '+1555' }]);
    expect(merged.performer.specialty).toBe('Cardiology');
    expect(merged.performer.institution?.name).toBe('City Hospital');
    expect(merged.sourceDocuments).toEqual(['doc-1', 'doc-2']);
  });

  it('deduplicates source documents', () => {
    const existing = makeContact({ sourceDocuments: ['doc-1', 'doc-2'] });
    const incoming = makeContact({ sourceDocuments: ['doc-2', 'doc-3'] });

    const merged = mergeContact(existing, incoming);
    expect(merged.sourceDocuments).toEqual(['doc-1', 'doc-2', 'doc-3']);
  });

  it('merges specialties without duplicates', () => {
    const existing = makeContact({
      vcard: { fn: 'John', specialty: ['Cardiology'] },
    });
    const incoming = makeContact({
      vcard: { fn: 'John', specialty: ['Cardiology', 'Internal Medicine'] },
    });

    const merged = mergeContact(existing, incoming);
    expect(merged.vcard.specialty).toEqual(['Cardiology', 'Internal Medicine']);
  });

  it('keeps existing lastSeen if incoming is older', () => {
    const existing = makeContact({ lastSeen: '2026-06-01' });
    const incoming = makeContact({ lastSeen: '2026-01-01' });

    const merged = mergeContact(existing, incoming);
    expect(merged.lastSeen).toBe('2026-06-01');
  });

  it('updates lastSeen if incoming is newer', () => {
    const existing = makeContact({ lastSeen: '2026-01-01' });
    const incoming = makeContact({ lastSeen: '2026-06-01' });

    const merged = mergeContact(existing, incoming);
    expect(merged.lastSeen).toBe('2026-06-01');
  });
});
