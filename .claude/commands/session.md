# Doctor-Patient Session Analysis

We are working on the session management feature for real-time doctor-patient consultation analysis.

$ARGUMENTS

## Core Architecture

### Session Management
- **Session Manager**: `src/lib/session/manager.ts` - EventEmitter system with in-memory Map storage, medical context integration, SSE transport, OpenAI thread management
- **Analysis Manager**: `src/lib/session/analysis-manager.ts` - AI analysis orchestration
- **Analysis Integration**: `src/lib/session/analysis-integration.ts` - Bridges manager and analysis pipeline
- **Constants**: `src/lib/session/constants.ts`
- **Document Storage**: `src/lib/session/document-storage.ts`

### Stores (`src/lib/session/stores/`)
- **Unified Session Store**: `unified-session-store.ts` - Combines audio, analysis, UI, transport state
- **Session Data Store**: `session-data-store.ts` - Immutable data with relationship indexing + Sankey transformations
- **Session Viewer Store**: `session-viewer-store.ts` - UI interaction state (selections, hover, active paths, focus)
- **Transcript Store**: `transcript-store.ts` - Real-time SSE integration with medical relevance detection
- **QOM Execution Store**: `qom-execution-store.ts` - Tracks QOM expert pipeline execution state
- **Audio Actions**: `audio-actions.ts` - Audio recording state management
- **Store Manager**: `session-store-manager.ts` - Coordinates store lifecycle
- Store instances: `session-data-store-instance.ts`, `session-viewer-store-instance.ts`
- Utils: `utils/session-data-utils.ts`

### QOM Pipeline (`src/lib/session/qom/`)
- **QOM Transformer**: `qom-transformer.ts` - Transforms analysis data for visualization
- **QOM Event Processor**: `qom-event-processor.ts` - Processes SSE events from expert pipeline
- **QOM Simulation**: `qom-simulation.ts` - Development simulation of QOM pipeline
- **Dynamic Layout Engine**: `dynamic-layout-engine.ts` - Positions nodes in Sankey/QOM layout

### Transport (`src/lib/session/transport/`)
- **SSE Client**: `sse-client.ts` - Real-time server communication with reconnection handling
- **Realtime Transcription**: `realtime-transcription.ts` - Live audio transcription streaming

### Audio Pipeline
- `src/lib/session/audio/` - Session-specific audio (audio-processing, microphone-utils, vad-helpers)
- `src/lib/audio/` - Core audio library (AudioManager, microphone, assemblyai, googlesdk, overlap-processor)
- `src/lib/audio/streaming/` - Streaming transcription (StreamingTranscriptionClient, DeepgramStreamingProvider)
- See `TRANSCRIPTION.md` for provider details

### Testing
- `src/lib/session/testing/` - Transcript loader and test utilities

## UI Components (`src/components/session/`)

### Main Components
- `SankeyDiagram.svelte` - D3.js medical relationship visualization
- `QOMVisualizer.svelte` - QOM expert pipeline visualization
- `SessionMoeVisualizer.svelte` - MoE analysis visualization
- `SessionSidebar.svelte` - Tabbed interface (transcript, questions, details)
- `SessionToolbar.svelte` - Session controls toolbar
- `SessionHeaderButton.svelte` - Header integration
- `SessionTabs.svelte` - Tab navigation
- `EndSessionModal.svelte` - Session end confirmation
- `Legend.svelte`, `SessionLegendTab.svelte` - Visual legend
- `LinkTooltip.svelte` - Relationship hover tooltips
- `NodeDetails.svelte` - Selected node detail panel
- `QuestionManager.svelte` - AI-generated question management
- `ZoomControls.svelte` - Zoom in/out controls

### Tab Components
- `SessionTranscriptTab.svelte` - Live transcript display
- `SessionQuestionsTab.svelte` - AI-generated questions
- `SessionSymptomsTab.svelte` - Symptom summary
- `SessionDiagnosisTab.svelte` - Diagnosis summary
- `SessionTreatmentsTab.svelte` - Treatment summary
- `SessionDetailsTab.svelte` - Full detail view

### Node Components (`nodes/`)
- `SymptomNode.svelte`, `DiagnosisNode.svelte`, `TreatmentNode.svelte`

### Detail Components (`details/`)
- `SymptomDetails.svelte`, `DiagnosisDetails.svelte`, `TreatmentDetails.svelte`
- `ActionDetails.svelte`, `LinkDetails.svelte`

### Shared Components (`shared/`)
- `AlertCard.svelte`, `AlertsSection.svelte`, `DiagnosisCard.svelte`
- `InfoGrid.svelte`, `NodeActions.svelte`, `PriorityIndicator.svelte`
- `QuestionCard.svelte`, `QuestionsSection.svelte`
- `RelationshipsSection.svelte`, `SymptomCard.svelte`, `TreatmentCard.svelte`

## CSS

- `src/css/session.css` - Session-specific styles

## Configuration Schemas

- `src/lib/configurations/session.diagnosis.ts` - Session diagnosis extraction schema
- `src/lib/configurations/session.diagnosis.enhanced.ts` - Enhanced diagnosis schema
- `src/lib/configurations/session.diagnosis.streamlined.ts` - Streamlined diagnosis schema
- `src/lib/configurations/session.report.ts` - Session report generation schema

## API Routes (`src/routes/v1/session/`)

- `start/+server.ts` - Start new session
- `[sessionId]/stream/+server.ts` - SSE stream endpoint
- `[sessionId]/audio/+server.ts` - Audio upload endpoint
- `[sessionId]/transcribe/+server.ts` - Transcription endpoint
- `[sessionId]/status/+server.ts` - Session status

## Documentation

- `AI_SESSION_WORKFLOW.md` - Full session AI workflow phases
- `AI_SESSION_QOM.md` - QOM expert pipeline architecture
- `AI_SESSION_ANALYSIS.md` - Analysis pipeline details
- `TRANSCRIPTION.md` - Audio transcription providers and setup

## Data Flow

```
Audio Input -> VAD -> Transcription -> Medical Relevance Detection
-> Context Assembly -> QOM Expert Pipeline (10 nodes) -> SSE Stream
-> Stores -> Sankey/QOM Visualization
```

## QOM Expert Pipeline (10 Nodes)

Sequential: `transcript_parser` -> `symptom_extractor` -> `diagnosis_mapper`
Parallel: `treatment_recommender`, `question_generator`, `warning_annotator`
Sequential: `relationship_builder` -> `schema_merger` -> `user_feedback_applier` -> `node_cleaner`
