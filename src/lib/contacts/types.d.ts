import type { VCard } from '$lib/contact/types.d';

export interface ProviderInstitution {
  name?: string;
  department?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface ProviderPerformer {
  role: string;
  specialty?: string;
  licenseNumber?: string;
  institution?: ProviderInstitution;
}

export interface ProviderContact {
  id: string;
  vcard: VCard;
  performer: ProviderPerformer;
  sourceDocuments: string[];
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
  userEdited: boolean;
  mergedFrom?: string[];
  // Sync tracking
  syncedToDevice: boolean;
  deviceContactId?: string;
  lastSyncedAt?: string;
}

export interface ContactsDocumentContent {
  title: string;
  tags: string[];
  providers: ProviderContact[];
  version: number;
}
