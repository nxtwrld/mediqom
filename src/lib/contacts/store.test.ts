import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDocuments, mockAddDocument, mockUpdateDocument, documentsMock, loggerMock } = vi.hoisted(() => {
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
  getContacts,
  getContactsDocument,
  processDocumentForContacts,
} from './store';
import type { ContactsDocumentContent } from './types.d';

function setDocs(docs: any[]) {
  mockDocuments.set(docs);
}

function makeContactsDoc(profileId: string, providers: any[] = []) {
  return {
    id: 'contacts-doc-1',
    user_id: profileId,
    type: DocumentType.contacts,
    key: 'test-key',
    owner_id: profileId,
    metadata: { title: 'Provider Contacts', tags: ['contacts'] },
    content: {
      title: 'Provider Contacts',
      tags: ['contacts', 'providers'],
      providers,
      version: 1,
    } satisfies ContactsDocumentContent,
    attachments: [],
  };
}

describe('contacts store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDocs([]);
  });

  describe('getContacts', () => {
    it('returns empty array when no contacts document exists', () => {
      expect(getContacts('profile-1')).toEqual([]);
    });

    it('returns providers from contacts document', () => {
      const providers = [
        { id: 'c-1', vcard: { fn: 'Dr. Smith' }, performer: { role: 'surgeon' } },
      ];
      setDocs([makeContactsDoc('profile-1', providers)]);
      const result = getContacts('profile-1');
      expect(result).toHaveLength(1);
      expect(result[0].vcard.fn).toBe('Dr. Smith');
    });

    it('returns contacts only for the specified profile', () => {
      setDocs([
        makeContactsDoc('profile-1', [{ id: 'c-1', vcard: { fn: 'A' } }]),
        {
          ...makeContactsDoc('profile-2', [{ id: 'c-2', vcard: { fn: 'B' } }]),
          id: 'contacts-doc-2',
        },
      ]);

      expect(getContacts('profile-1')).toHaveLength(1);
      expect(getContacts('profile-1')[0].vcard.fn).toBe('A');
    });
  });

  describe('getContactsDocument', () => {
    it('returns undefined when no contacts document exists', () => {
      expect(getContactsDocument('profile-1')).toBeUndefined();
    });

    it('returns the contacts document for the profile', () => {
      setDocs([makeContactsDoc('profile-1')]);
      const doc = getContactsDocument('profile-1');
      expect(doc).toBeDefined();
      expect(doc?.type).toBe(DocumentType.contacts);
    });
  });

  describe('processDocumentForContacts', () => {
    it('does nothing when content has no performers', async () => {
      await processDocumentForContacts('profile-1', 'doc-1', { title: 'Test', tags: [] });
      expect(mockAddDocument).not.toHaveBeenCalled();
      expect(mockUpdateDocument).not.toHaveBeenCalled();
    });

    it('creates a new contacts document when none exists', async () => {
      const content = {
        performer: { name: 'Dr. New', role: 'primary_physician' },
      };

      await processDocumentForContacts('profile-1', 'doc-1', content);
      expect(mockAddDocument).toHaveBeenCalledTimes(1);
      const call = mockAddDocument.mock.calls[0][0];
      expect(call.type).toBe(DocumentType.contacts);
      expect(call.content.providers).toHaveLength(1);
      expect(call.content.providers[0].vcard.fn).toBe('Dr. New');
    });

    it('updates existing contacts document with new contact', async () => {
      const existingProviders = [
        {
          id: 'c-1',
          vcard: { fn: 'Existing Doc' },
          performer: { role: 'surgeon' },
          sourceDocuments: ['old-doc'],
          userEdited: false,
          syncedToDevice: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];
      setDocs([makeContactsDoc('profile-1', existingProviders)]);

      const content = {
        performer: { name: 'Brand New Doctor', role: 'cardiologist' },
      };

      await processDocumentForContacts('profile-1', 'doc-2', content);
      expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
      const updatedDoc = mockUpdateDocument.mock.calls[0][0];
      expect(updatedDoc.content.providers).toHaveLength(2);
    });

    it('merges duplicate contacts instead of adding new ones', async () => {
      const existingProviders = [
        {
          id: 'c-1',
          vcard: { fn: 'Dr. Smith' },
          performer: { role: 'surgeon' },
          sourceDocuments: ['doc-1'],
          userEdited: false,
          syncedToDevice: false,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];
      setDocs([makeContactsDoc('profile-1', existingProviders)]);

      const content = {
        performer: { name: 'Dr. Smith', role: 'surgeon', specialty: 'Orthopedic Surgery' },
      };

      await processDocumentForContacts('profile-1', 'doc-2', content);
      expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
      const updatedDoc = mockUpdateDocument.mock.calls[0][0];
      expect(updatedDoc.content.providers).toHaveLength(1);
      expect(updatedDoc.content.providers[0].performer.specialty).toBe('Orthopedic Surgery');
      expect(updatedDoc.content.providers[0].sourceDocuments).toContain('doc-1');
      expect(updatedDoc.content.providers[0].sourceDocuments).toContain('doc-2');
    });

    it('handles extraction errors gracefully', async () => {
      await processDocumentForContacts('profile-1', 'doc-1', null as any);
      expect(mockAddDocument).not.toHaveBeenCalled();
    });
  });
});
