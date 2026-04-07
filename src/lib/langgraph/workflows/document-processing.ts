/**
 * Document Processing Workflow - Entry Point
 *
 * This module re-exports the unified workflow as the primary implementation.
 * All consumers import `runDocumentProcessingWorkflow` from this file.
 */

// Export unified workflow as primary implementation
export { runUnifiedDocumentProcessingWorkflow as runDocumentProcessingWorkflow } from "./unified-workflow";
