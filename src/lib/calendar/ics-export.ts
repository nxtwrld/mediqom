import type { Appointment } from './types.d';

/**
 * Convert an appointment to an ICS (iCalendar) VEVENT string.
 */
export function toICSEvent(appointment: Appointment): string {
  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${appointment.id}@mediqom.com`,
    `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
    `SUMMARY:${escapeICS(appointment.title)}`,
  ];

  if (appointment.dateTime) {
    lines.push(`DTSTART:${formatICSDate(appointment.dateTime)}`);
    if (appointment.duration) {
      const endDate = new Date(appointment.dateTime);
      endDate.setMinutes(endDate.getMinutes() + appointment.duration);
      lines.push(`DTEND:${formatICSDate(endDate.toISOString())}`);
    }
  }

  if (appointment.provider?.name) {
    lines.push(`ORGANIZER;CN=${escapeICS(appointment.provider.name)}:MAILTO:noreply@mediqom.com`);
  }

  const description: string[] = [];
  if (appointment.appointmentType) {
    description.push(`Type: ${appointment.appointmentType}`);
  }
  if (appointment.provider?.specialty) {
    description.push(`Specialty: ${appointment.provider.specialty}`);
  }
  if (appointment.provider?.phone) {
    description.push(`Phone: ${appointment.provider.phone}`);
  }
  if (description.length) {
    lines.push(`DESCRIPTION:${escapeICS(description.join('\\n'))}`);
  }

  // Reminders
  for (const minutes of appointment.reminders) {
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeICS(appointment.title)}`);
    lines.push(`TRIGGER:-PT${minutes}M`);
    lines.push('END:VALARM');
  }

  // Priority mapping
  const priorityMap: Record<string, number> = {
    immediate: 1,
    urgent: 3,
    routine: 5,
    as_needed: 9,
  };
  if (appointment.priority && priorityMap[appointment.priority]) {
    lines.push(`PRIORITY:${priorityMap[appointment.priority]}`);
  }

  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/**
 * Generate a full ICS calendar file from appointments.
 */
export function toICSCalendar(appointments: Appointment[]): string {
  const events = appointments
    .filter((a) => a.status !== 'dismissed' && a.dateTime)
    .map(toICSEvent);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mediqom//Medical Appointments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Mediqom Medical Appointments',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Trigger an ICS file download for a single appointment.
 */
export function downloadICS(appointment: Appointment): void {
  const cal = toICSCalendar([appointment]);
  const name = appointment.title.replace(/[^a-zA-Z0-9]/g, '_');
  const blob = new Blob([cal], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Trigger an ICS file download for all appointments.
 */
export function downloadAllICS(appointments: Appointment[]): void {
  const cal = toICSCalendar(appointments);
  const blob = new Blob([cal], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mediqom-appointments.ics';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Format an ISO date string to ICS format (YYYYMMDDTHHMMSSZ).
 */
function formatICSDate(iso: string): string {
  // Handle date-only strings (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso.replace(/-/g, '');
  }
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape special characters for ICS format.
 */
function escapeICS(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}
