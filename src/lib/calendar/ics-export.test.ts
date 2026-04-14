import { describe, it, expect } from 'vitest';
import { toICSEvent, toICSCalendar } from './ics-export';
import type { Appointment } from './types.d';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'apt-1',
    title: 'Follow-up: Cardiology',
    appointmentType: 'office_visit',
    dateTime: '2026-06-15T10:00:00Z',
    duration: 30,
    provider: {
      name: 'Dr. Smith',
      specialty: 'Cardiology',
      phone: '+1-555-1234',
    },
    sourceDocumentId: 'doc-1',
    priority: 'routine',
    status: 'confirmed',
    reminders: [1440, 60],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    synced: false,
    ...overrides,
  };
}

describe('toICSEvent', () => {
  it('generates valid VEVENT structure', () => {
    const text = toICSEvent(makeAppointment());
    expect(text).toContain('BEGIN:VEVENT');
    expect(text).toContain('END:VEVENT');
  });

  it('includes UID', () => {
    const text = toICSEvent(makeAppointment());
    expect(text).toContain('UID:apt-1@mediqom.com');
  });

  it('includes SUMMARY', () => {
    const text = toICSEvent(makeAppointment());
    expect(text).toContain('SUMMARY:Follow-up: Cardiology');
  });

  it('includes DTSTART and DTEND', () => {
    const text = toICSEvent(makeAppointment());
    expect(text).toContain('DTSTART:20260615T100000Z');
    expect(text).toContain('DTEND:20260615T103000Z');
  });

  it('includes ORGANIZER with provider name', () => {
    const text = toICSEvent(makeAppointment());
    expect(text).toContain('ORGANIZER;CN=Dr. Smith');
  });

  it('includes DESCRIPTION with appointment details', () => {
    const text = toICSEvent(makeAppointment());
    expect(text).toContain('DESCRIPTION:');
    expect(text).toContain('Type: office_visit');
    expect(text).toContain('Specialty: Cardiology');
    expect(text).toContain('Phone: +1-555-1234');
  });

  it('includes VALARM for each reminder', () => {
    const text = toICSEvent(makeAppointment());
    const alarms = text.split('BEGIN:VALARM');
    expect(alarms).toHaveLength(3); // 2 reminders + 1 for the split before first
    expect(text).toContain('TRIGGER:-PT1440M');
    expect(text).toContain('TRIGGER:-PT60M');
  });

  it('includes PRIORITY', () => {
    const text = toICSEvent(makeAppointment({ priority: 'urgent' }));
    expect(text).toContain('PRIORITY:3');

    const text2 = toICSEvent(makeAppointment({ priority: 'immediate' }));
    expect(text2).toContain('PRIORITY:1');
  });

  it('handles date-only format', () => {
    const text = toICSEvent(makeAppointment({ dateTime: '2026-06-15' }));
    expect(text).toContain('DTSTART:20260615');
  });

  it('omits DTSTART when no dateTime', () => {
    const text = toICSEvent(makeAppointment({ dateTime: undefined }));
    expect(text).not.toContain('DTSTART');
    expect(text).not.toContain('DTEND');
  });

  it('omits ORGANIZER when no provider', () => {
    const text = toICSEvent(makeAppointment({ provider: undefined }));
    expect(text).not.toContain('ORGANIZER');
  });

  it('handles no reminders', () => {
    const text = toICSEvent(makeAppointment({ reminders: [] }));
    expect(text).not.toContain('BEGIN:VALARM');
  });

  it('escapes special characters in title', () => {
    const text = toICSEvent(makeAppointment({ title: 'Follow-up; check A, B' }));
    expect(text).toContain('SUMMARY:Follow-up\\; check A\\, B');
  });
});

describe('toICSCalendar', () => {
  it('generates valid iCalendar structure', () => {
    const cal = toICSCalendar([makeAppointment()]);
    expect(cal).toContain('BEGIN:VCALENDAR');
    expect(cal).toContain('VERSION:2.0');
    expect(cal).toContain('PRODID:-//Mediqom//Medical Appointments//EN');
    expect(cal).toContain('END:VCALENDAR');
  });

  it('includes VEVENT entries', () => {
    const cal = toICSCalendar([
      makeAppointment({ id: 'apt-1' }),
      makeAppointment({ id: 'apt-2' }),
    ]);
    const events = cal.split('BEGIN:VEVENT');
    expect(events).toHaveLength(3); // 2 events + 1 for header
  });

  it('filters out dismissed appointments', () => {
    const cal = toICSCalendar([
      makeAppointment({ id: 'apt-1', status: 'confirmed' }),
      makeAppointment({ id: 'apt-2', status: 'dismissed' }),
    ]);
    expect(cal).toContain('UID:apt-1@mediqom.com');
    expect(cal).not.toContain('UID:apt-2@mediqom.com');
  });

  it('filters out appointments without dateTime', () => {
    const cal = toICSCalendar([
      makeAppointment({ id: 'apt-1', dateTime: '2026-06-15' }),
      makeAppointment({ id: 'apt-2', dateTime: undefined }),
    ]);
    expect(cal).toContain('UID:apt-1@mediqom.com');
    expect(cal).not.toContain('UID:apt-2@mediqom.com');
  });

  it('handles empty array', () => {
    const cal = toICSCalendar([]);
    expect(cal).toContain('BEGIN:VCALENDAR');
    expect(cal).toContain('END:VCALENDAR');
    expect(cal).not.toContain('BEGIN:VEVENT');
  });

  it('includes calendar name', () => {
    const cal = toICSCalendar([makeAppointment()]);
    expect(cal).toContain('X-WR-CALNAME:Mediqom Medical Appointments');
  });
});
