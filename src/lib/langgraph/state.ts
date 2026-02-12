import type { Signal } from "$lib/types";
import type { Content, TokenUsage } from "$lib/ai/types";
import type { FunctionDefinition } from "@langchain/core/language_models/base";

// Enhanced signal types for the new system
export interface EnhancedSignal extends Signal {
  // Core fields (preserved for compatibility)
  signal: string;
  value: any;
  unit: string;
  reference: string;
  date: string;
  urgency?: number;
  source?: string;
  refId?: string;

  // Enhanced fields
  context: SignalContext;
  validation: SignalValidation;
  relationships: SignalRelationship[];
  metadata: SignalMetadata;
}

export interface SignalContext {
  documentType: string;
  specimen?: string;
  method?: string;
  fasting?: boolean;
  location?: string;
  clinicalContext?: string[];
}

export interface SignalValidation {
  status: "validated" | "unvalidated" | "suspicious" | "invalid";
  confidence: number;
  validationSources: string[];
  warnings?: string[];
  alternatives?: string[];
}

export interface SignalRelationship {
  type: "derives_from" | "correlates_with" | "contradicts" | "confirms";
  targetSignal: string;
  strength: number;
  formula?: string;
}

export interface SignalMetadata {
  extractedBy: string;
  extractionConfidence: number;
  alternativeInterpretations?: any[];
  clinicalNotes?: string;
  trending?: any;
}

// Feature detection result from existing system
export interface FeatureDetection {
  type: string;
  confidence: number;
  features: string[];
}

// AI feature detection results from comprehensive analysis
export interface AIFeatureDetectionResults {
  isMedical: boolean;
  language: string;
  documentType: string;
  medicalSpecialty: string[];
  urgencyLevel: number;
  tags: string[];

  // Core section flags
  hasSummary: boolean;
  hasDiagnosis: boolean;
  hasBodyParts: boolean;
  hasPerformer: boolean;
  hasRecommendations: boolean;
  hasSignals: boolean;
  hasPrescriptions: boolean;
  hasImmunizations: boolean;

  // Medical specialty section flags
  hasImaging: boolean;
  isMedicalImaging: boolean; // Specific flag for medical imaging workflow
  hasDental: boolean;
  hasAdmission: boolean;
  hasProcedures: boolean;
  hasAnesthesia: boolean;
  hasSpecimens: boolean;
  hasMicroscopic: boolean;
  hasMolecular: boolean;
  hasECG: boolean;
  hasEcho: boolean;
  hasTriage: boolean;
  hasTreatments: boolean;
  hasAssessment: boolean;

  // Enhanced specialty section flags
  hasTumorCharacteristics: boolean;
  hasTreatmentPlan: boolean;
  hasTreatmentResponse: boolean;
  hasImagingFindings: boolean;
  hasGrossFindings: boolean;
  hasSpecialStains: boolean;
  hasAllergies: boolean;
  hasMedications: boolean;
  hasSocialHistory: boolean;
}

// Medical analysis result from existing system
export interface MedicalAnalysis {
  content: any;
  tokenUsage: TokenUsage;
  provider?: string;
  error?: string;
}

// Document type analysis result
export interface DocumentTypeAnalysis {
  detectedSections: string[];
  confidence: number;
  documentType: string;
  detectedType: string; // Add the missing detectedType property
  medicalSpecialty: string[];
  urgencyLevel: number;
  language: string;
  contentFeatures: {
    medicalTermDensity: number;
    structuredData: boolean;
    reportLength: number;
    specialtyIndicators: string[];
  };
  sectionFlags: Record<string, boolean>;
}

// Progress tracking interface for SSE updates
export interface ProgressEvent {
  type: "progress" | "complete" | "error";
  stage: string;
  progress: number;
  message: string;
  data?: any;
  timestamp: number;
}

// Progress callback type
export type ProgressCallback = (event: ProgressEvent) => void;

// LangGraph workflow state
export interface DocumentProcessingState {
  // Input
  images?: string[];
  text?: string;
  language?: string;
  options?: any;
  metadata?: Record<string, any>;

  // Progress tracking
  progressCallback?: ProgressCallback;
  currentStage?: string;
  stageProgress?: number;
  totalStages?: number;
  completedStages?: number;

  // Processing state
  content: Content[];
  tokenUsage: TokenUsage;

  // Analysis results
  featureDetection?: FeatureDetection;
  featureDetectionResults?: AIFeatureDetectionResults;
  medicalAnalysis?: MedicalAnalysis;
  signals?: EnhancedSignal[];
  report?: any; // Add report field
  imaging?: any;
  medications?: any;
  procedures?: any;

  // Document type routing
  documentTypeAnalysis?: DocumentTypeAnalysis;
  selectedSchema?: FunctionDefinition;
  processingComplexity?: "low" | "medium" | "high";
  nextSteps?: string[];
  processingPlan?: any; // ProcessingPlan interface from document-type-router

  // Enhanced capabilities
  selectedProvider?: string;
  fallbackProviders?: string[];
  providerMetadata?: any;
  validationResults?: Map<string, SignalValidation>;
  relationships?: SignalRelationship[];
  clinicalPatterns?: string[];
  missingSignals?: string[];
  confidence?: number;

  // Error handling
  errors?: Array<{
    node: string;
    error: string;
    timestamp: string;
  }>;
  processingErrors?: string[];

  // Quality validation
  qualityChecks?: string[];

  // Multi-node execution results
  multiNodeResults?: {
    processedNodes: string[];
    successfulNodes?: number;
    failedNodes?: number;
    executionTime: number;
    parallelGroups?: number;
    executionStats?: any;
    message?: string;
  };

  // Medical terms generation results
  medicalTermsGeneration?: {
    success?: boolean;
    error?: string;
    skipped?: boolean;
    reason?: string;
    termsCount?: number;
    temporalType?: string;
    timestamp: string;
    medicalTermsData?: {
      medicalTerms: string[];
      temporalType: string;
      metadata: {
        language: string;
        documentType: string;
        processingDate: string;
        extractionMethod: string;
      };
    };
  };

  // Progress tracking methods
  emitProgress?: (
    stage: string,
    progress: number,
    message: string,
    data?: any,
  ) => void;
  emitComplete?: (stage: string, message: string, data?: any) => void;
  emitError?: (stage: string, message: string, error?: any) => void;
}

// Node execution result
export interface NodeResult {
  updates: Partial<DocumentProcessingState>;
  continueToNext: boolean;
  error?: string;
}

// Workflow configuration
export interface WorkflowConfig {
  useEnhancedSignals?: boolean;
  enableExternalValidation?: boolean;
  preferredProvider?: string;
  streamResults?: boolean;
}
