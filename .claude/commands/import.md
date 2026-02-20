# Medical Document Import Flow

We are working on the import flow for medical documents.

$ARGUMENTS

## Architecture

- **Client Processing**: Document handling and UI in `src/components/import/` with SSE progress streaming
- **Server Analysis**: AI processing in `src/lib/import.server/` with multi-provider support
- **LangGraph Workflow**: Advanced orchestration in `src/lib/langgraph/` with 23+ specialized nodes
- **Import Modes**: Dual support for traditional batch and real-time SSE streaming
- **Security Model**: Client-side AES encryption with RSA key management - server never accesses raw keys
- **Workflow Features**: Recording/replay for development, parallel processing, selective analysis

## Client Components (`src/components/import/`)

- `Index.svelte` - Main import orchestrator
- `DropFiles.svelte` - Drag-and-drop file upload
- `ImportDocument.svelte` - Single document import handler
- `ImportedDocument.svelte` - Imported document display
- `ImportProfile.svelte` - Profile-linked import
- `SelectProfile.svelte` - Profile selection
- `FileProgressCard.svelte` - Per-file progress display
- `DualStageProgress.svelte` - Two-stage progress indicator
- `ScanningAnimation.svelte` - Scanning visual feedback

## Server Processing (`src/lib/import.server/`)

- `analyzeReport.ts` - AI-powered report analysis orchestration
- `assessInputs.ts` - Input assessment and validation
- `gemini.ts` - Google Gemini provider integration

## LangGraph Workflow (`src/lib/langgraph/`)

### Nodes (`nodes/`)

- `_base-processing-node.ts` - Base class for all processing nodes
- `document-type-router.ts` - Routes documents to appropriate pipeline
- `feature-detection.ts` - Detects document features and types
- `input-validation.ts` - Validates input documents
- `quality-gate.ts` - Quality assurance checkpoint
- `cross-validation-aggregator.ts` - Cross-validates extraction results
- `external-validation.ts` - External validation service
- `provider-selection.ts` - AI provider selection logic
- `anomaly-detection.ts` - Medical anomaly detection
- `body-parts-detection.ts` - Body part extraction
- `imaging-processing.ts` - Medical image processing
- `measurement-extraction.ts` - Measurement extraction
- `medical-imaging-analysis.ts` - Imaging analysis pipeline
- `medical-terms-generation.ts` - Medical terminology extraction
- `patient-performer-detection.ts` - Patient/performer extraction
- `visual-analysis.ts` - Visual content analysis

### Workflows (`workflows/`)

- `unified-workflow.ts` - Main unified processing workflow
- `document-processing.ts` - Standard document processing
- `medical-imaging-workflow.ts` - Medical imaging pipeline
- `multi-node-orchestrator.ts` - Multi-node parallel orchestration

### Infrastructure

- `state.ts` - Workflow state definitions
- `state-medical-imaging.ts` - Imaging workflow state
- `streaming-wrapper.ts` - SSE streaming integration
- `factories/universal-node-factory.ts` - Node instantiation factory
- `interfaces/` - Processing result and feature refinement interfaces
- `registry/node-registry.ts` - Node type registry
- `validation/schema-dependency-analyzer.ts` - Schema dependency analysis

## Configuration Schemas

Medical extraction schemas in `src/lib/configurations/` define what data to extract. See `@schema` command for details.

## API Routes (`src/routes/v1/import/`)

- `extract/+server.ts` - Standard extraction endpoint
- `extract/stream/+server.ts` - SSE streaming extraction
- `medical-imaging/+server.ts` - Medical imaging analysis
- `medical-imaging/stream/+server.ts` - SSE streaming imaging analysis
- `report/stream/+server.ts` - Report streaming endpoint

## Documentation

- `docs/IMPORT.md` - Full import architecture documentation
- `AI_IMPORT_USER_CONFIGURATION.md` - User configuration for import schemas
