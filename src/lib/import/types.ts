// Shared types for import functionality
// This file contains types that are used both client and server side
// DO NOT import any server-only modules here

import type { TokenUsage } from "$lib/ai/types.d";

export interface Assessment {
  pages: AssessmentPage[];
  documents: AssessmentDocument[];
  tokenUsage: TokenUsage;
}

export interface AssessmentDocument {
  title: string;
  date: string;
  language: string;
  isMedical: boolean;
  isMedicalImaging?: boolean; // Flag for post-extraction routing to medical imaging analysis
  pages: number[];
}

export interface AssessmentPage {
  page: number;
  language: string;
  text: string;
  images: {
    type: string;
    position: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    data: string;
  }[];
  image?: string;
  thumbnail?: string;
}

export enum Types {
  featureDetection = "featureDetection",
  report = "report",
  laboratory = "laboratory",
  dental = "dental",
  imaging = "imaging",
  prescription = "prescription",
  immunization = "immunization",
  dicom = "dicom",
  fhir = "fhir",
}

export interface ReportAnalysis {
  type: Types;
  fhirType: string;
  fhir: any;
  cagegory: string;
  isMedical: boolean;
  tags: string[];
  hasPrescription: boolean;
  hasImmunization: boolean;
  hasLabOrVitals: boolean;
  content?: string;
  report?: any;
  signals?: any;
  text: string;
  imaging?: any;
  prescriptions?: any;
  immunizations?: any;
  results?: {
    test: string;
    value: string;
    unit: string;
    reference: string;
  }[];
  recommendations?: string[];
  tokenUsage: TokenUsage;
  // Add missing properties that are being accessed in the code
  title?: string;
  summary?: string;
}

// ---- Import Job types for resilient import flow ----

export type ImportJobStatus = 'created' | 'extracting' | 'analyzing' | 'completed' | 'error' | 'expired';

export interface FileManifestEntry {
  name: string;
  type: string;
  size: number;
  taskType: 'application/pdf' | 'images' | 'application/dicom';
  processedImages: string[]; // base64 strings of resized images for OCR
  dicomMetadata?: any;
  thumbnail?: string;
}

export interface ImportJob {
	id: string
	user_id: string
	status: ImportJobStatus
	stage: string | null
	progress: number
	message: string | null
	error: string | null
	scan_deducted: boolean
	processing_started_at: string | null
	file_count: number
	file_manifest: FileManifestEntry[]
	language: string
	extraction_result: Assessment[] | null // Deprecated: use encrypted_extraction_result
	analysis_results: ReportAnalysis[] // Deprecated: use encrypted_analysis_results
	encrypted_extraction_result?: string // AES-256-GCM encrypted with IV
	encrypted_analysis_results?: string // AES-256-GCM encrypted with IV
	result_encryption_key?: string // Job encryption key wrapped with user RSA public key
	created_at: string
	updated_at: string
	expires_at: string
}

export interface ImportJobCreateInput {
  files: FileManifestEntry[];
  language: string;
}
