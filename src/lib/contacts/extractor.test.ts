import { describe, it, expect } from 'vitest';
import { extractProviderContacts } from './extractor';

describe('extractProviderContacts', () => {
  it('returns empty array for content with no performers', () => {
    const result = extractProviderContacts({ title: 'Test', tags: [] }, 'doc-1');
    expect(result).toEqual([]);
  });

  it('extracts from single performer object', () => {
    const content = {
      performer: {
        name: 'John Smith',
        role: 'cardiologist',
        title: 'Dr.',
        specialty: 'Cardiology',
        institution: {
          name: 'City Hospital',
          department: 'Cardiology Dept',
          phone: '+1-555-1234',
          email: 'jsmith@hospital.com',
          address: '123 Main St',
        },
        licenseNumber: 'LIC-001',
        datePerformed: '2026-03-15',
      },
    };

    const result = extractProviderContacts(content, 'doc-1', '2026-03-15');

    expect(result).toHaveLength(1);
    const c = result[0];
    expect(c.vcard.fn).toBe('Dr. John Smith');
    expect(c.vcard.org).toBe('City Hospital');
    expect(c.vcard.tel).toEqual([{ type: 'work', value: '+1-555-1234' }]);
    expect(c.vcard.email).toEqual([{ type: 'work', value: 'jsmith@hospital.com' }]);
    expect(c.vcard.specialty).toEqual(['Cardiology']);
    expect(c.performer.role).toBe('cardiologist');
    expect(c.performer.licenseNumber).toBe('LIC-001');
    expect(c.performer.institution?.name).toBe('City Hospital');
    expect(c.sourceDocuments).toEqual(['doc-1']);
    expect(c.lastSeen).toBe('2026-03-15');
    expect(c.syncedToDevice).toBe(false);
    expect(c.userEdited).toBe(false);
  });

  it('extracts from performers array', () => {
    const content = {
      performers: [
        { name: 'Alice Johnson', role: 'surgeon' },
        { name: 'Bob Wilson', role: 'anesthesiologist' },
      ],
    };

    const result = extractProviderContacts(content, 'doc-2');
    expect(result).toHaveLength(2);
    expect(result[0].vcard.fn).toBe('Alice Johnson');
    expect(result[1].vcard.fn).toBe('Bob Wilson');
  });

  it('extracts from recommendations referralTo', () => {
    const content = {
      recommendations: {
        recommendations: [
          {
            recommendation: 'See cardiologist',
            category: 'referral',
            priority: 'urgent',
            referralTo: {
              provider: {
                name: 'Jane Cardio',
                role: 'cardiologist',
                specialty: 'Interventional Cardiology',
              },
              urgency: 'urgent',
              reason: 'Chest pain',
            },
          },
        ],
      },
    };

    const result = extractProviderContacts(content, 'doc-3');
    expect(result).toHaveLength(1);
    expect(result[0].vcard.fn).toBe('Jane Cardio');
    expect(result[0].performer.role).toBe('cardiologist');
  });

  it('extracts from followUpSchedule withProvider', () => {
    const content = {
      recommendations: {
        followUpSchedule: [
          {
            appointmentType: 'office visit',
            timeframe: '2 weeks',
            withProvider: {
              name: 'Dr. Follow',
              role: 'primary_physician',
              institution: { name: 'Primary Care Clinic' },
            },
            purpose: 'Check results',
          },
        ],
      },
    };

    const result = extractProviderContacts(content, 'doc-4');
    expect(result).toHaveLength(1);
    expect(result[0].vcard.fn).toBe('Dr. Follow');
    expect(result[0].performer.institution?.name).toBe('Primary Care Clinic');
  });

  it('extracts from top-level followUpSchedule', () => {
    const content = {
      followUpSchedule: [
        {
          appointmentType: 'imaging',
          timeframe: '1 month',
          withProvider: { name: 'Imaging Doc', role: 'radiologist' },
        },
      ],
    };

    const result = extractProviderContacts(content, 'doc-5');
    expect(result).toHaveLength(1);
    expect(result[0].vcard.fn).toBe('Imaging Doc');
  });

  it('extracts from nested section performers', () => {
    const content = {
      pathology: {
        performer: {
          name: 'Pathology Expert',
          role: 'pathologist',
          specialty: 'Molecular Pathology',
        },
      },
    };

    const result = extractProviderContacts(content, 'doc-6');
    expect(result).toHaveLength(1);
    expect(result[0].vcard.fn).toBe('Pathology Expert');
  });

  it('skips performers without a name', () => {
    const content = {
      performers: [
        { role: 'surgeon' }, // no name
        { name: 'Valid Doctor', role: 'surgeon' },
        { name: '', role: 'nurse_practitioner' }, // empty name
      ],
    };

    const result = extractProviderContacts(content, 'doc-7');
    expect(result).toHaveLength(1);
    expect(result[0].vcard.fn).toBe('Valid Doctor');
  });

  it('splits name into given/family for multi-word names', () => {
    const content = {
      performer: { name: 'John Michael Smith', role: 'surgeon' },
    };

    const result = extractProviderContacts(content, 'doc-8');
    expect(result[0].vcard.n?.givenName).toBe('John');
    expect(result[0].vcard.n?.familyName).toBe('Michael Smith');
  });

  it('generates unique IDs for each contact', () => {
    const content = {
      performers: [
        { name: 'Doctor A', role: 'surgeon' },
        { name: 'Doctor B', role: 'surgeon' },
      ],
    };

    const result = extractProviderContacts(content, 'doc-9');
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('uses datePerformed as lastSeen when no document date', () => {
    const content = {
      performer: { name: 'Dr. Date', role: 'surgeon', datePerformed: '2026-05-01' },
    };

    const result = extractProviderContacts(content, 'doc-10');
    expect(result[0].lastSeen).toBe('2026-05-01');
  });

  it('prefers document date over datePerformed for lastSeen', () => {
    const content = {
      performer: { name: 'Dr. Date', role: 'surgeon', datePerformed: '2026-05-01' },
    };

    const result = extractProviderContacts(content, 'doc-10', '2026-06-01');
    expect(result[0].lastSeen).toBe('2026-06-01');
  });

  it('handles complex content with multiple extraction points', () => {
    const content = {
      performer: { name: 'Primary Doc', role: 'primary_physician' },
      performers: [{ name: 'Nurse Jane', role: 'nurse_practitioner' }],
      recommendations: {
        recommendations: [
          {
            recommendation: 'See specialist',
            category: 'referral',
            priority: 'routine',
            referralTo: {
              provider: { name: 'Specialist X', role: 'neurologist' },
            },
          },
        ],
        followUpSchedule: [
          {
            appointmentType: 'lab work',
            timeframe: '1 week',
            withProvider: { name: 'Lab Tech', role: 'lab_technician' },
          },
        ],
      },
    };

    const result = extractProviderContacts(content, 'doc-11');
    const names = result.map((c) => c.vcard.fn);
    expect(names).toContain('Primary Doc');
    expect(names).toContain('Nurse Jane');
    expect(names).toContain('Specialist X');
    expect(names).toContain('Lab Tech');
  });
});
