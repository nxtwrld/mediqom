import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDocuments, mockAddDocument, mockUpdateDocument, documentsMock, loggerMock } = vi.hoisted(() => {
  // Minimal writable store compatible with svelte/store's get()
  function makeWritable<T>(initial: T) {
    let value = initial;
    const subs = new Set<(v: T) => void>();
    return {
      subscribe(cb: (v: T) => void) {
        subs.add(cb);
        cb(value);
        return () => subs.delete(cb);
      },
      set(v: T) {
        value = v;
        subs.forEach((cb) => cb(v));
      },
      update(fn: (v: T) => T) {
        value = fn(value);
        subs.forEach((cb) => cb(value));
      },
    };
  }

  const docs = makeWritable<any[]>([]);
  const addDoc = vi.fn().mockResolvedValue(undefined);
  const updateDoc = vi.fn().mockResolvedValue(undefined);
  const mock = {
    documents: docs,
    default: { subscribe: docs.subscribe },
    addDocument: addDoc,
    updateDocument: updateDoc,
    loadDocument: vi.fn(),
    loadDocuments: vi.fn(),
    getDocument: vi.fn(),
    setDocuments: vi.fn(),
    byUser: vi.fn(),
    profileStores: {},
  };
  const logger = {
    logger: {
      documents: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      },
    },
  };
  return { mockDocuments: docs, mockAddDocument: addDoc, mockUpdateDocument: updateDoc, documentsMock: mock, loggerMock: logger };
});

vi.mock('$lib/documents', () => documentsMock);
vi.mock('$lib/documents/index', () => documentsMock);
vi.mock('$lib/logging/logger', () => loggerMock);

import { DocumentType } from '$lib/documents/types.d';
import {
  getAppointments,
  getAppointmentsDocument,
  processDocumentForAppointments,
} from './store';
import type { AppointmentsDocumentContent } from './types.d';

function setDocs(docs: any[]) {
  mockDocuments.set(docs);
}

function makeAppointmentsDoc(profileId: string, appointments: any[] = []) {
  return {
    id: 'appointments-doc-1',
    user_id: profileId,
    type: DocumentType.appointments,
    key: 'test-key',
    owner_id: profileId,
    metadata: { title: 'Appointments', tags: ['appointments'] },
    content: {
      title: 'Appointments',
      tags: ['appointments', 'calendar'],
      appointments,
      version: 1,
    } satisfies AppointmentsDocumentContent,
    attachments: [],
  };
}

describe('calendar store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDocs([]);
  });

  describe('getAppointments', () => {
    it('returns empty array when no appointments document exists', () => {
      expect(getAppointments('profile-1')).toEqual([]);
    });

    it('returns appointments from the appointments document', () => {
      const appointments = [
        { id: 'apt-1', title: 'Follow-up', status: 'suggested' },
      ];
      setDocs([makeAppointmentsDoc('profile-1', appointments)]);
      const result = getAppointments('profile-1');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Follow-up');
    });
  });

  describe('getAppointmentsDocument', () => {
    it('returns undefined when no appointments document exists', () => {
      expect(getAppointmentsDocument('profile-1')).toBeUndefined();
    });

    it('returns the appointments document for the profile', () => {
      setDocs([makeAppointmentsDoc('profile-1')]);
      const doc = getAppointmentsDocument('profile-1');
      expect(doc).toBeDefined();
      expect(doc?.type).toBe(DocumentType.appointments);
    });
  });

  describe('processDocumentForAppointments', () => {
    it('does nothing when content has no appointment data', async () => {
      await processDocumentForAppointments('profile-1', 'doc-1', { title: 'Test' });
      expect(mockAddDocument).not.toHaveBeenCalled();
      expect(mockUpdateDocument).not.toHaveBeenCalled();
    });

    it('creates a new appointments document when none exists', async () => {
      const content = {
        followUpSchedule: [
          { appointmentType: 'office visit', timeframe: '2 weeks' },
        ],
      };

      await processDocumentForAppointments('profile-1', 'doc-1', content);
      expect(mockAddDocument).toHaveBeenCalledTimes(1);
      const call = mockAddDocument.mock.calls[0][0];
      expect(call.type).toBe(DocumentType.appointments);
      expect(call.content.appointments).toHaveLength(1);
    });

    it('updates existing document with new appointments', async () => {
      const existing = [
        {
          id: 'apt-1',
          title: 'Existing',
          appointmentType: 'lab work',
          sourceDocumentId: 'old-doc',
          status: 'confirmed',
        },
      ];
      setDocs([makeAppointmentsDoc('profile-1', existing)]);

      const content = {
        followUpSchedule: [
          { appointmentType: 'imaging', timeframe: '1 month' },
        ],
      };

      await processDocumentForAppointments('profile-1', 'doc-2', content);
      expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
      const updated = mockUpdateDocument.mock.calls[0][0];
      expect(updated.content.appointments).toHaveLength(2);
    });

    it('skips duplicate appointments from same source document', async () => {
      const existing = [
        {
          id: 'apt-1',
          title: 'Follow-up: office visit',
          appointmentType: 'office visit',
          sourceDocumentId: 'doc-1',
          status: 'suggested',
        },
      ];
      setDocs([makeAppointmentsDoc('profile-1', existing)]);

      const content = {
        followUpSchedule: [
          { appointmentType: 'office visit', timeframe: '2 weeks' },
        ],
      };

      await processDocumentForAppointments('profile-1', 'doc-1', content);
      expect(mockUpdateDocument).not.toHaveBeenCalled();
    });

    it('handles extraction errors gracefully', async () => {
      await processDocumentForAppointments('profile-1', 'doc-1', null as any);
      expect(mockAddDocument).not.toHaveBeenCalled();
    });

    it('extracts from referral recommendations', async () => {
      const content = {
        recommendations: {
          recommendations: [
            {
              recommendation: 'See neurologist',
              category: 'referral',
              priority: 'urgent',
              referralTo: {
                provider: { name: 'Dr. Neuro', role: 'neurologist' },
                urgency: 'urgent',
              },
            },
          ],
        },
      };

      await processDocumentForAppointments('profile-1', 'doc-1', content);
      expect(mockAddDocument).toHaveBeenCalledTimes(1);
      const call = mockAddDocument.mock.calls[0][0];
      const appointments = call.content.appointments;
      expect(appointments).toHaveLength(1);
      expect(appointments[0].appointmentType).toBe('referral');
      expect(appointments[0].priority).toBe('urgent');
    });
  });
});
