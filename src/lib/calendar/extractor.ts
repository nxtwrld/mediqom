import type { Appointment, AppointmentPriority } from './types.d';

/**
 * Extract appointments from document content.
 * Scans followUpSchedule, referrals, and carePlan for appointment data.
 */
export function extractAppointments(
  content: Record<string, any>,
  documentId: string,
  documentDate?: string,
): Appointment[] {
  const appointments: Appointment[] = [];
  const now = new Date().toISOString();

  // Extract from followUpSchedule
  const schedule = content.followUpSchedule || content.recommendations?.followUpSchedule;
  if (Array.isArray(schedule)) {
    for (const item of schedule) {
      const appointment = followUpToAppointment(item, documentId, documentDate, now);
      if (appointment) appointments.push(appointment);
    }
  }

  // Extract from recommendations with referral category
  const recs = Array.isArray(content.recommendations)
    ? content.recommendations
    : content.recommendations?.recommendations;

  if (Array.isArray(recs)) {
    for (const rec of recs) {
      if (rec.category === 'referral' && rec.referralTo) {
        const appointment = referralToAppointment(rec, documentId, documentDate, now);
        if (appointment) appointments.push(appointment);
      }
      // Follow-up category recommendations with timeframe
      if (rec.category === 'follow_up' && rec.timeframe) {
        const appointment = recommendationToAppointment(rec, documentId, documentDate, now);
        if (appointment) appointments.push(appointment);
      }
    }
  }

  // Extract from carePlan.reviewDate
  const carePlan = content.carePlan || content.recommendations?.carePlan;
  if (carePlan?.reviewDate) {
    appointments.push({
      id: crypto.randomUUID(),
      title: 'Care plan review',
      appointmentType: 'review',
      dateTime: carePlan.reviewDate,
      duration: 30,
      sourceDocumentId: documentId,
      priority: 'routine',
      status: 'suggested',
      reminders: [1440, 60],
      createdAt: now,
      updatedAt: now,
      synced: false,
    });
  }

  return appointments;
}

function followUpToAppointment(
  item: Record<string, any>,
  documentId: string,
  documentDate: string | undefined,
  now: string,
): Appointment | null {
  if (!item.appointmentType && !item.timeframe) return null;

  const provider = item.withProvider
    ? {
        name: item.withProvider.name || '',
        specialty: item.withProvider.specialty,
        phone: item.withProvider.institution?.phone,
      }
    : undefined;

  const dateTime = resolveTimeframe(item.timeframe, documentDate);

  return {
    id: crypto.randomUUID(),
    title: `Follow-up: ${item.appointmentType || item.purpose || 'Appointment'}`,
    appointmentType: item.appointmentType || 'office_visit',
    dateTime: dateTime?.resolved ? dateTime.iso : undefined,
    timeframe: dateTime?.resolved ? undefined : item.timeframe,
    duration: 30,
    provider,
    sourceDocumentId: documentId,
    priority: 'routine',
    status: dateTime?.resolved ? 'suggested' : 'suggested',
    reminders: [1440, 60],
    createdAt: now,
    updatedAt: now,
    synced: false,
  };
}

function referralToAppointment(
  rec: Record<string, any>,
  documentId: string,
  documentDate: string | undefined,
  now: string,
): Appointment | null {
  const referral = rec.referralTo;
  const provider = referral.provider
    ? {
        name: referral.provider.name || '',
        specialty: referral.provider.specialty,
        phone: referral.provider.institution?.phone,
      }
    : undefined;

  const priority = mapUrgency(referral.urgency);

  return {
    id: crypto.randomUUID(),
    title: `Referral: ${referral.provider?.specialty || referral.reason || 'Specialist'}`,
    appointmentType: 'referral',
    timeframe: rec.timeframe,
    duration: 30,
    provider,
    sourceDocumentId: documentId,
    priority,
    status: 'suggested',
    reminders: [1440, 60],
    createdAt: now,
    updatedAt: now,
    synced: false,
  };
}

function recommendationToAppointment(
  rec: Record<string, any>,
  documentId: string,
  documentDate: string | undefined,
  now: string,
): Appointment | null {
  const dateTime = resolveTimeframe(rec.timeframe, documentDate);

  return {
    id: crypto.randomUUID(),
    title: rec.recommendation || 'Follow-up',
    appointmentType: 'follow_up',
    dateTime: dateTime?.resolved ? dateTime.iso : undefined,
    timeframe: dateTime?.resolved ? undefined : rec.timeframe,
    duration: 30,
    sourceDocumentId: documentId,
    priority: mapPriority(rec.priority),
    status: 'suggested',
    reminders: [1440, 60],
    createdAt: now,
    updatedAt: now,
    synced: false,
  };
}

function mapUrgency(urgency?: string): AppointmentPriority {
  switch (urgency) {
    case 'emergency': return 'immediate';
    case 'urgent': return 'urgent';
    default: return 'routine';
  }
}

function mapPriority(priority?: string): AppointmentPriority {
  switch (priority) {
    case 'immediate': return 'immediate';
    case 'urgent': return 'urgent';
    case 'as_needed': return 'as_needed';
    default: return 'routine';
  }
}

/**
 * Attempt to resolve a timeframe string (e.g. "in 2 weeks") into an ISO date
 * relative to a reference date.
 */
function resolveTimeframe(
  timeframe?: string,
  referenceDate?: string,
): { resolved: boolean; iso?: string } | undefined {
  if (!timeframe) return undefined;

  // If it's already an ISO date, use it directly
  if (/^\d{4}-\d{2}-\d{2}/.test(timeframe)) {
    return { resolved: true, iso: timeframe };
  }

  if (!referenceDate) return { resolved: false };

  const ref = new Date(referenceDate);
  if (isNaN(ref.getTime())) return { resolved: false };

  // Try to parse relative timeframes
  const match = timeframe.match(/(\d+)\s*(day|week|month|year)s?/i);
  if (!match) return { resolved: false };

  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const result = new Date(ref);
  switch (unit) {
    case 'day': result.setDate(result.getDate() + amount); break;
    case 'week': result.setDate(result.getDate() + amount * 7); break;
    case 'month': result.setMonth(result.getMonth() + amount); break;
    case 'year': result.setFullYear(result.getFullYear() + amount); break;
  }

  return { resolved: true, iso: result.toISOString().split('T')[0] };
}
