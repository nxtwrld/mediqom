export type AppointmentPriority = 'immediate' | 'urgent' | 'routine' | 'as_needed';
export type AppointmentStatus = 'suggested' | 'confirmed' | 'completed' | 'dismissed';

export interface AppointmentProvider {
  contactId?: string;
  name: string;
  specialty?: string;
  phone?: string;
}

export interface Appointment {
  id: string;
  title: string;
  appointmentType: string;
  dateTime?: string;
  timeframe?: string;
  duration?: number;
  provider?: AppointmentProvider;
  sourceDocumentId?: string;
  sourceSessionId?: string;
  priority: AppointmentPriority;
  status: AppointmentStatus;
  reminders: number[];
  createdAt: string;
  updatedAt: string;
  // Sync tracking
  synced: boolean;
  nativeEventId?: string;
  lastSyncedAt?: string;
}

export interface AppointmentsDocumentContent {
  title: string;
  tags: string[];
  appointments: Appointment[];
  version: number;
}

export interface CalendarConnection {
  type: 'native' | 'google' | 'outlook';
  calendarId?: string;
  connectedAt: string;
  lastSyncAt?: string;
}
