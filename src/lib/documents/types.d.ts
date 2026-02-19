export enum DocumentType {
  "profile" = "profile",
  "document" = "document",
  "health" = "health",
  "internal" = "internal",
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
    [key: string]: any;
  };
  content?: string | undefined;
  author_id?: string;
  owner_id: string;

  // Unified medical terms for search
  medicalTerms?: string[]; // Single array: categories + bodyParts + diagnoses + temporal + procedures
  temporalType?: TemporalType; // Simple temporal classification
}

export interface DocumentEncrypted {
  id: string;
  metadata: string;
  content?: string;
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
    [key: string]: any;
  };
  content: {
    title: string;
    tags: string[];
    sessionAnalysis?: any; // Session analysis data from medical consultations
    [key: string]: any;
  };
  attachments: Attachment[];
  author_id?: string;
  owner_id: string;
  created_at?: string; // Document creation timestamp

  // Unified medical terms for search
  medicalTerms?: string[]; // Single array: categories + bodyParts + diagnoses + temporal + procedures
  temporalType?: TemporalType; // Simple temporal classification

  // Legacy report analysis data (from LangGraph workflows)
  report?: any;
}

export interface DocumentNew {
  type: DocumentType;
  metadata?: {
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
}

export interface Attachment {
  path: string;
  url: string;
  type?: string;
  thumbnail?: string;
  file?: string; // Base64 encoded file data
}
