// Main entry point for LangGraph integration
// Provides wrapper for existing code

import { runDocumentProcessingWorkflow } from "./workflows/document-processing";
import type { WorkflowConfig } from "./state";

// Analyze function using LangGraph workflow
export async function analyzeWithLangGraph(
  images?: string[],
  text?: string,
  language?: string,
  options?: {
    useEnhancedSignals?: boolean;
    enableExternalValidation?: boolean;
    preferredProvider?: string;
  },
) {
  // Always use LangGraph workflow
  const config: WorkflowConfig = {
    useEnhancedSignals: options?.useEnhancedSignals || false,
    enableExternalValidation: options?.enableExternalValidation || false,
    preferredProvider: options?.preferredProvider,
    streamResults: false,
  };

  return runDocumentProcessingWorkflow(
    images || [],
    text || "",
    language || "English",
    config,
  );
}

// Export types for use in other parts of the application
export type {
  EnhancedSignal,
  SignalContext,
  SignalValidation,
  SignalRelationship,
  DocumentProcessingState,
  WorkflowConfig,
} from "./state";
