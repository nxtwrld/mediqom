export enum DocumentType {
  "profile" = "profile",
  "document" = "document",
  "health" = "health",
  "internal" = "internal",
  "contacts" = "contacts",
  "appointments" = "appointments",
}

export enum DocumentState {
  NEW = "NEW",
  ASSESSING = "ASSESSING",
  ASSESSED = "ASSESSED",
  PROCESSING = "PROCESSING",
  PROCESSED = "PROCESSED",
  ERROR = "ERROR",
  NONMEDICAL = "NONMEDICAL",
  CANCELED = "CANCELED",
}

export enum TemporalType {
  LATEST = "latest",
  RECENT = "recent",
  HISTORICAL = "historical",
}

export interface DocumentPreload {
  id: string;
  key: string;
  type: DocumentType;
  user_id: string;
  metadata: {
    title: string;
    tags: string[];
    schemaVersion?: number;
    [key: string]: any;
  };
  content?: string | undefined;
  thumbnail?: string;
  author_id?: string;
  owner_id: string;

  // Unified medical terms for search
  medicalTerms?: string[]; // Single array: categories + bodyParts + diagnoses + temporal + procedures
  temporalType?: TemporalType; // Simple temporal classification
  subtype?: 'medication' | 'medication-plan';
}

export interface DocumentEncrypted {
  id: string;
  metadata: string;
  content?: string;
  thumbnail?: string;
  attachments?: string[];
  type: DocumentType;
  user_id: string;
  keys: { key: string; owner_id: string }[];
  author_id?: string;
  owner_id: string;
  created_at?: string; // Document creation timestamp
}

export interface Document {
  type: DocumentType;
  id: string;
  key: string;
  user_id: string;
  metadata: {
    title: string;
    tags: string[];
    schemaVersion?: number;
    [key: string]: any;
  };
  content: {
    title: string;
    tags: string[];
    sessionAnalysis?: any; // Session analysis data from medical consultations
    [key: string]: any;
  };
  attachments: Attachment[];
  thumbnail?: string;
  author_id?: string;
  owner_id: string;
  created_at?: string; // Document creation timestamp

  // Unified medical terms for search
  medicalTerms?: string[]; // Single array: categories + bodyParts + diagnoses + temporal + procedures
  temporalType?: TemporalType; // Simple temporal classification
  subtype?: 'medication' | 'medication-plan';

  // Legacy report analysis data (from LangGraph workflows)
  report?: any;
}

export interface DocumentNew {
  type: DocumentType;
  metadata?: {
    schemaVersion?: number;
    [key: string]: any;
  };
  content: {
    title: string;
    tags: string[];
    sessionAnalysis?: any; // Session analysis data from medical consultations
    [key: string]: any;
  };
  attachments?: Attachment[];
  user_id?: string;
  // Optional medical terms from analysis
  medicalTerms?: string[];
  temporalType?: TemporalType;
  subtype?: 'medication' | 'medication-plan';
}

export interface Attachment {
  path: string;
  url: string;
  type?: string;
  thumbnail?: string;
  file?: string; // Base64 encoded file data
  embedded?: boolean; // true for cropped embedded images (photos, diagrams, charts)
  imageId?: string; // stable reference ID e.g. "img-0" for markdown references
}
