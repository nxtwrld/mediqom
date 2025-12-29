# Transcription Strategy: Context Management & Diarization

## Overview

This document outlines our strategy for enhancing the audio transcription system with context continuity and speaker diarization capabilities. We are extending the existing `transcription-abstraction.ts` library rather than creating a separate library to maintain centralized transcription logic.

## Problem Statement

Current transcription challenges:

1. **Chunk Boundary Issues**: Words and sentences split across 10-second audio chunks
2. **Context Loss**: Each chunk transcribed independently without conversational context
3. **Hallucinations**: Whisper generates fabricated or repetitive content when lacking context
4. **Speaker Confusion**: Cannot distinguish between multiple speakers (doctor/patient)
5. **Overlap Waste**: 5-second audio overlaps not utilized for context or de-duplication

## Goals

1. **Context Continuity**: Use previous transcription as prompt context (224 token limit ~800 chars)
2. **Speaker Diarization**: Identify and label different speakers in medical consultations
3. **De-duplication**: Detect and remove duplicate text from overlapping audio regions
4. **Configurable**: Support both diarization and non-diarization use cases
5. **Backward Compatible**: Existing code continues to work without modification

## Technical Foundation

### Existing Architecture

**AudioManager** (`src/lib/audio/AudioManager.ts`):
- Creates 10-second optimized chunks with 5-second overlap
- `createOverlappingChunk()` method (lines 275-328) already implemented
- Overlap currently NOT used for transcription context

**TranscriptionProviderAbstraction** (`src/lib/ai/providers/transcription-abstraction.ts`):
- Centralized API for all transcription operations
- Supports multiple providers (OpenAI, Azure, Google)
- Model configuration via `config/audio-transcription.json`
- Current anti-hallucination features:
  - `chunking_strategy: "auto"` - Server-side VAD
  - `temperature: 0` - Deterministic output
  - `gpt-4o-mini-transcribe` model

### Whisper API Capabilities

**Prompt Parameter** (224 tokens ~800 chars):
- Accepts previous transcription text to maintain continuity
- Improves accuracy across chunk boundaries
- Helps model understand conversational context

**Diarization Models**:
- `gpt-4o-mini-transcribe` - High quality, supports prompts, NO diarization
- `gpt-4o-transcribe-diarize` - Speaker identification, NO prompt support

**Response Formats**:
- `text` - Plain text transcription
- `json` - Basic JSON with text + metadata
- `verbose_json` - Segments + timestamps
- `diarized_json` - Speaker-labeled segments (diarization model only)

**Trade-offs**:
- Context prompts OR diarization, not both simultaneously
- Diarization requires model switch and different response format

## Proposed Solution

### Extension Strategy

We will extend `TranscriptionProviderAbstraction` class with:

1. **Context Buffer Management**: Track recent transcriptions for prompt construction
2. **Overlap Detection**: De-duplicate text from overlapping audio regions
3. **Diarization Toggle**: Switch between models based on use case
4. **Flexible API**: Backward compatible with optional context features

### New Class Properties

```typescript
export class TranscriptionProviderAbstraction {
  // Existing properties...

  // NEW: Context management per session
  private contextBuffers: Map<string, {
    transcriptions: string[];
    maxContextChars: number;
    enableDiarization: boolean;
    lastProcessedTimestamp: number;
  }> = new Map();

  // NEW: Overlap detection cache
  private overlapCache: Map<string, {
    lastChunkText: string;
    overlapStartIndex: number;
  }> = new Map();
}
```

### New Configuration Schema

**`config/audio-transcription.json`** additions:

```json
{
  "providers": {
    "openai": {
      "models": {
        "whisper": {
          "name": "gpt-4o-mini-transcribe",
          // ... existing config
        },
        "whisper-diarize": {
          "name": "gpt-4o-transcribe-diarize",
          "description": "OpenAI GPT-4o Transcribe with speaker diarization",
          "supportedFormats": ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"],
          "maxFileSize": "25MB",
          "languages": ["en", "cs", "de", "es", "fr", "it", "ja", "ko", "pt", "ru", "zh"],
          "responseFormats": ["diarized_json"],
          "temperature": 0,
          "supportsDiarization": true
        }
      }
    }
  },
  "transcriptionSettings": {
    "contextManagement": {
      "enabled": true,
      "maxContextChars": 800,
      "minContextChars": 100,
      "overlapDetectionThreshold": 0.7,
      "enableDeduplication": true
    }
  }
}
```

### New TypeScript Interfaces

```typescript
export interface TranscriptionContextOptions {
  sessionId: string;
  enableContext: boolean;
  enableDiarization: boolean;
  maxContextChars?: number;
}

export interface DiarizedSegment {
  speaker: string;  // "A", "B", "C", etc.
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptionResultWithContext extends TranscriptionResult {
  context?: {
    usedPrompt: string;
    contextChars: number;
    deduplicatedChars: number;
  };
  diarization?: {
    segments: DiarizedSegment[];
    speakerCount: number;
  };
}
```

### New Public Methods

```typescript
/**
 * Initialize context tracking for a session
 */
initializeContext(options: TranscriptionContextOptions): void;

/**
 * Clear context for a session
 */
clearContext(sessionId: string): void;

/**
 * Transcribe with automatic context management
 */
async transcribeWithContext(
  sessionId: string,
  audioData: File,
  options: TranscriptionOptions
): Promise<TranscriptionResultWithContext>;

/**
 * Process diarization results into speaker-labeled segments
 */
private processDiarizedResponse(response: any): DiarizedSegment[];

/**
 * Build context prompt from buffer
 */
private buildContextPrompt(sessionId: string): string;

/**
 * Detect and remove overlapping text
 */
private removeOverlap(
  sessionId: string,
  newText: string
): { cleaned: string; removedChars: number };

/**
 * Find longest common substring for overlap detection
 */
private findLongestOverlap(str1: string, str2: string): {
  overlap: string;
  startIndex: number;
  threshold: number;
};
```

## Implementation Phases

### Phase 1: Audio Test Page (Week 1)

**Goal**: Validate context and diarization features in isolation

**Implementation**: `/src/routes/med/audio-test/+page.svelte`

**Features**:
1. Toggle between context-enabled and diarization modes
2. Visual display of context prompts being used
3. De-duplication metrics (chars removed)
4. Speaker labels in transcript display
5. Side-by-side comparison mode

**Success Criteria**:
- Context prompts reduce hallucinations and improve continuity
- Overlap detection removes duplicate text accurately
- Diarization correctly identifies speakers in multi-person audio
- No regression in single-speaker transcription quality

**Code Changes**:
```typescript
// NEW UI controls in audio-test page
let transcriptionMode = $state<'context' | 'diarization'>('context');
let contextMetrics = $state<{
  contextChars: number;
  deduplicatedChars: number;
  usedPrompt: string;
}>({ contextChars: 0, deduplicatedChars: 0, usedPrompt: '' });

// Initialize context when recording starts
async function startRecording() {
  const sessionId = crypto.randomUUID();

  transcriptionProvider.initializeContext({
    sessionId,
    enableContext: transcriptionMode === 'context',
    enableDiarization: transcriptionMode === 'diarization',
    maxContextChars: 800
  });

  // ... existing recording logic
}

// Use new transcribeWithContext method
async function transcribeChunk(audioData: Float32Array, sessionId: string) {
  const mp3Blob = await convertFloat32ToMp3(audioData, 16000);
  const audioFile = new File([mp3Blob], 'chunk.mp3', { type: 'audio/mp3' });

  const result = await transcriptionProvider.transcribeWithContext(
    sessionId,
    audioFile,
    {
      language,
      translate: enableTranslation,
      prompt: customPrompt.trim() || undefined
    }
  );

  // Display context metrics
  if (result.context) {
    contextMetrics = {
      contextChars: result.context.contextChars,
      deduplicatedChars: result.context.deduplicatedChars,
      usedPrompt: result.context.usedPrompt
    };
  }

  // Display diarization if available
  if (result.diarization) {
    // Render speaker-labeled segments
  }
}
```

**Testing Checklist**:
- [ ] Context mode reduces split sentences across chunks
- [ ] Overlap de-duplication removes duplicate phrases
- [ ] Diarization mode correctly labels speakers A/B/C
- [ ] Custom prompts still work with context enabled
- [ ] Translation works with both modes
- [ ] Memory usage stays reasonable with long recordings

### Phase 2: Unified Session Store (Week 2)

**Goal**: Integrate context management into medical consultation sessions

**Implementation**: `/src/lib/session/stores/unified-session-store.ts`

**Features**:
1. Enable diarization for doctor-patient conversations
2. Speaker labels ("Doctor", "Patient") based on diarization
3. Context continuity across entire consultation
4. Transcript with speaker attribution

**Integration Points**:

**`startRecordingSession()` method** (lines 327-453):
```typescript
async startRecordingSession(options = {}): Promise<boolean> {
  const { language, models, useRealtime, translate } = options;

  // Create session on server
  const sessionData = await createSessionResponse.json();
  const sessionId = sessionData.sessionId;

  // NEW: Initialize transcription context with diarization
  transcriptionProvider.initializeContext({
    sessionId,
    enableContext: true,
    enableDiarization: true,  // Always ON for medical sessions
    maxContextChars: 800
  });

  // ... existing logic
}
```

**`sendAudioChunk()` method** (lines 914-989):
```typescript
async sendAudioChunk(audioData: Float32Array): Promise<boolean> {
  const currentState = get(unifiedSessionStore);
  const sessionId = currentState.audio.sessionId;

  try {
    const mp3Blob = await convertFloat32ToMp3(audioData, 16000);

    // NEW: Use transcribeWithContext instead of direct API call
    const result = await transcriptionProvider.transcribeWithContext(
      sessionId,
      new File([mp3Blob], "chunk.mp3", { type: "audio/mp3" }),
      {
        language: currentState.audio.language,
        translate: false  // Medical sessions preserve original language
      }
    );

    // NEW: Process diarization results
    if (result.diarization) {
      for (const segment of result.diarization.segments) {
        unifiedSessionActions.addTranscript({
          id: `${chunkId}_${segment.speaker}`,
          text: segment.text,
          confidence: segment.confidence || 0.8,
          timestamp: Date.now(),
          is_final: true,
          speaker: segment.speaker,  // "A", "B", "C"
          sequenceNumber
        });
      }
    } else {
      // Fallback for non-diarized response
      unifiedSessionActions.addTranscript({
        id: chunkId,
        text: result.text,
        confidence: result.confidence || 0.8,
        timestamp: Date.now(),
        is_final: true,
        sequenceNumber
      });
    }

    return true;
  } catch (error) {
    logger.session.error("Failed to send audio chunk", { error });
    return false;
  }
}
```

**`resetSession()` method** (lines 999-1005):
```typescript
async resetSession(): Promise<void> {
  const sessionId = get(unifiedSessionStore).audio.sessionId;

  // NEW: Clear transcription context
  if (sessionId) {
    transcriptionProvider.clearContext(sessionId);
  }

  logger.session.info("Resetting unified session store");
  unifiedSessionStore.set(initialState);

  await new Promise(resolve => setTimeout(resolve, 50));
}
```

**Success Criteria**:
- Medical consultations show "Doctor" and "Patient" labels
- Context maintains continuity across entire session
- No performance degradation with diarization enabled
- Transcript UI displays speaker attribution clearly

**Testing Checklist**:
- [ ] Diarization works in real-world medical consultations
- [ ] Speaker labels are accurate and consistent
- [ ] Context reduces hallucinations in long sessions
- [ ] Session reset properly clears context buffers
- [ ] Memory usage scales linearly with session length

### Phase 3: Serenity Audio Input (Week 3)

**Goal**: Flexible transcription for form-filling scenarios

**Implementation**: `/src/components/serenity/SerenityAudioInput.svelte`

**Features**:
1. Context enabled, diarization DISABLED (single speaker assumed)
2. Optimized for user dictation and form responses
3. Lower latency without diarization overhead

**Integration Points**:

**`handleAudioChunk()` method** (lines 91-99):
```typescript
function handleAudioChunk(chunk: Float32Array, metadata: any) {
  audioChunks.push(chunk);

  // NEW: Track session ID for context
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    transcriptionProvider.initializeContext({
      sessionId,
      enableContext: true,
      enableDiarization: false,  // OFF for single-speaker form filling
      maxContextChars: 800
    });
  }

  console.log('📦 Received audio chunk:', {
    samples: chunk.length,
    sequenceNumber: metadata?.sequenceNumber,
    totalChunks: audioChunks.length
  });
}
```

**`stopRecording()` method** (lines 101-140):
```typescript
async function stopRecording() {
  await audioManager.stop();
  audioManager.off('audio-chunk', handleAudioChunk);

  if (audioChunks.length === 0) {
    alert('No audio recorded. Please try again.');
    isRecording = false;
    return;
  }

  try {
    const combined = float32Flatten(audioChunks);
    const mp3Blob = await convertFloat32ToMp3(combined, 16000);
    const audioFile = new File([mp3Blob], 'recording.mp3', { type: 'audio/mp3' });

    // NEW: Use transcribeWithContext for final transcription
    const result = await transcriptionProvider.transcribeWithContext(
      sessionId,
      audioFile,
      {
        language: 'cs',  // Or user-selected language
        translate: false
      }
    );

    // NEW: Clear context after transcription
    transcriptionProvider.clearContext(sessionId);
    sessionId = null;

    isRecording = false;
    audioChunks = [];

    onAudioReady(audioFile);
  } catch (error) {
    console.error('Failed to process recording:', error);
    alert('Failed to process recording');
    isRecording = false;
    audioChunks = [];
  }
}
```

**Success Criteria**:
- Form-filling transcription maintains high accuracy
- Context improves continuity without diarization overhead
- Lower latency than diarization mode
- Backward compatible with existing form workflows

**Testing Checklist**:
- [ ] Context mode works without diarization
- [ ] Form responses transcribed accurately
- [ ] No regression in existing form functionality
- [ ] Performance better than Phase 2 (no diarization overhead)

## Architecture Decisions

### Why Extend Instead of New Library?

**Pros**:
1. **Single Source of Truth**: All transcription logic in one place
2. **Centralized Configuration**: Models and settings managed consistently
3. **Provider Abstraction**: Context/diarization work with any provider (future Azure/Google support)
4. **Backward Compatible**: Existing code continues to work unchanged
5. **Easier Testing**: One library to test, not two

**Cons**:
1. Larger file size (acceptable - still under 1000 lines with additions)
2. More complex class (mitigated by clear method separation)

### Context vs Diarization Trade-off

**Decision**: Support both modes, not simultaneously

**Rationale**:
- Whisper API limitation: prompts OR diarization, not both
- Different use cases have different priorities:
  - **Medical consultations**: Need speaker labels (diarization ON)
  - **Form filling**: Need continuity, single speaker (context ON, diarization OFF)
  - **Testing**: Need flexibility to test both modes

**Implementation**: Configuration per session via `initializeContext()`

### Overlap Detection Algorithm

**Approach**: Longest Common Substring (LCS) with threshold

**Rationale**:
- 5-second audio overlap typically produces 15-50 word overlap in text
- LCS finds exact duplicate phrases efficiently (O(n*m) time)
- Threshold prevents false positives from common words
- Configurable threshold (default 0.7 = 70% match required)

**Alternatives Considered**:
- Levenshtein distance (too slow for real-time)
- Simple string search (too brittle)
- No de-duplication (wastes tokens and context space)

### Context Buffer Management

**Approach**: Rolling window of last N characters

**Rationale**:
- 224 token limit = ~800 characters maximum
- Keep most recent transcriptions for relevance
- FIFO buffer: oldest dropped when limit exceeded
- Per-session isolation prevents context bleed

**Edge Cases**:
- Empty context: Send no prompt (graceful degradation)
- Context too short: Wait for minimum chars (default 100)
- Session timeout: Auto-clear context after inactivity

## Performance Considerations

### Memory Usage

**Context Buffers**: O(1) per session, max 800 chars each
**Overlap Cache**: O(1) per session, last chunk only
**Expected**: ~2-5 KB per active session

**Mitigation**:
- Auto-clear on session reset
- Timeout-based garbage collection (future)
- Max sessions limit (future)

### Latency Impact

**Context Mode**: +50-100ms (prompt processing)
**Diarization Mode**: +200-500ms (model switch + speaker detection)

**Mitigation**:
- Async processing (no blocking)
- Chunk-by-chunk streaming (user sees results incrementally)
- Configurable timeouts

### API Cost Impact

**Context Prompts**: +10-15% token usage (800 char prompt)
**Diarization Model**: +30% cost (gpt-4o-transcribe-diarize vs gpt-4o-mini-transcribe)

**Mitigation**:
- Context only when beneficial (configurable)
- Diarization only for multi-speaker scenarios
- Model selection per use case

## Error Handling

### Context Management Errors

**Buffer Overflow**: Truncate oldest, log warning
**Invalid Session ID**: Create new session, log error
**Context Corruption**: Clear context, fallback to no-context mode

### Diarization Errors

**Model Not Available**: Fallback to non-diarization model
**Response Format Error**: Parse as standard JSON, log warning
**Speaker Count Mismatch**: Use generic labels (A, B, C)

### Overlap Detection Errors

**No Overlap Found**: Skip de-duplication, log debug
**Threshold Too High**: Adjust dynamically, log info
**Algorithm Timeout**: Skip de-duplication, log warning

## Monitoring & Metrics

### Key Metrics to Track

**Context Effectiveness**:
- Average context chars used per chunk
- De-duplication rate (chars removed / total chars)
- Hallucination reduction (manual validation)

**Diarization Accuracy**:
- Speaker label consistency across chunks
- Speaker switch detection rate
- False positive speaker switches

**Performance**:
- Latency per transcription (with/without context/diarization)
- Memory usage per session
- API cost per session

### Logging Strategy

**Debug Level**: Context prompts, overlap detection details
**Info Level**: Session initialization, mode switches, metrics
**Warn Level**: Threshold adjustments, fallback activations
**Error Level**: API failures, context corruption

**Example Logs**:
```typescript
console.log("🎯 CONTEXT: Using prompt", {
  sessionId,
  contextChars: 750,
  deduplicatedChars: 45,
  mode: 'diarization'
});

console.log("🔄 OVERLAP: Removed duplicate", {
  sessionId,
  overlapLength: 45,
  threshold: 0.7,
  confidence: 0.85
});

console.log("🎤 DIARIZATION: Detected speakers", {
  sessionId,
  speakerCount: 2,
  segments: 5
});
```

## Testing Strategy

### Unit Tests

**Context Buffer Management**:
- Test buffer overflow handling
- Test FIFO behavior
- Test per-session isolation

**Overlap Detection**:
- Test LCS algorithm with known inputs
- Test threshold edge cases
- Test empty/null string handling

**Diarization Response Parsing**:
- Test various speaker count scenarios
- Test malformed response handling
- Test speaker label mapping

### Integration Tests

**Audio Test Page**:
- Test context mode with fabricated audio
- Test diarization mode with multi-speaker audio
- Test mode switching mid-session
- Test de-duplication metrics accuracy

**Unified Session Store**:
- Test medical consultation workflow
- Test speaker attribution consistency
- Test session reset clears context

**Serenity Audio Input**:
- Test form-filling scenario
- Test single-speaker optimization
- Test backward compatibility

### Manual Testing

**Real-world Scenarios**:
- Doctor-patient consultations (Czech language)
- Multi-party medical discussions (3+ speakers)
- Form dictation (single speaker)
- Mixed language conversations (CS/EN)

**Edge Cases**:
- Very long sessions (30+ minutes)
- Rapid speaker switching
- Background noise and crosstalk
- Silent periods and interruptions

## Migration Path

### Backward Compatibility

**Existing Code**: No changes required
- `transcribeAudio()` method unchanged
- `transcribeAudioCompatible()` method unchanged
- Existing configurations continue to work

**Opt-in Enhancement**: New features require explicit initialization
- Call `initializeContext()` to enable context/diarization
- Use `transcribeWithContext()` for enhanced features
- Use `clearContext()` for cleanup

### Version Support

**v1.0.0** (Current): Basic transcription with anti-hallucination
**v1.1.0** (Phase 1): Context management, diarization support
**v1.2.0** (Phase 2): Unified session integration
**v1.3.0** (Phase 3): Serenity component integration

### Deprecation Policy

**No Deprecations**: Existing methods remain supported
**Additive Changes**: New methods extend functionality
**Configuration Versioning**: New config fields with defaults

## Future Enhancements

### Phase 4: Advanced Features (Future)

1. **Adaptive Context Length**: Dynamically adjust based on conversational complexity
2. **Speaker Name Mapping**: Map "A"/"B" to "Doctor"/"Patient" via ML or config
3. **Multi-language Diarization**: Speaker labels across language switches
4. **Punctuation Restoration**: Improve readability of raw transcriptions
5. **Confidence-based Filtering**: Reject low-confidence chunks automatically

### Phase 5: Performance Optimizations (Future)

1. **Context Compression**: Summarize old context to fit more history
2. **Lazy Diarization**: Only diarize when speaker changes detected
3. **Batch Processing**: Process multiple chunks together for efficiency
4. **Caching Layer**: Cache common phrases and medical terms

### Phase 6: Analytics & Insights (Future)

1. **Quality Metrics Dashboard**: Real-time accuracy monitoring
2. **Speaker Analytics**: Talk time distribution, interruption patterns
3. **Medical Term Extraction**: Auto-highlight important clinical terms
4. **Conversation Summaries**: AI-generated session summaries

## Success Criteria

### Phase 1 Success Metrics

- [ ] Context mode reduces split sentences by 80%+
- [ ] De-duplication removes 90%+ of overlap text
- [ ] Diarization achieves 95%+ speaker label accuracy
- [ ] No regression in single-speaker quality
- [ ] Latency increase <200ms per chunk

### Phase 2 Success Metrics

- [ ] Medical sessions show accurate speaker attribution
- [ ] Context improves clinical term preservation
- [ ] No performance degradation in production
- [ ] User feedback positive on transcript quality

### Phase 3 Success Metrics

- [ ] Form-filling accuracy improves with context
- [ ] No regression in existing form workflows
- [ ] Performance better than Phase 2 (no diarization)

## Conclusion

This strategy provides a comprehensive, phased approach to enhancing transcription with context management and speaker diarization. By extending the existing `transcription-abstraction.ts` library, we maintain architectural consistency while adding powerful new capabilities.

The three-phase rollout allows incremental validation:
1. **Phase 1**: Isolated testing on audio-test page
2. **Phase 2**: Production medical sessions with diarization
3. **Phase 3**: Form-filling optimization without diarization

Key benefits:
- **Context Continuity**: 224-token prompts prevent split sentences
- **Speaker Attribution**: Diarization for multi-party conversations
- **De-duplication**: Remove overlap waste from 5-second audio overlap
- **Flexibility**: Configure per use case (context, diarization, or both)
- **Backward Compatible**: Existing code works unchanged

Expected outcomes:
- 60-80% reduction in hallucinations (Phase 1)
- 95%+ speaker attribution accuracy (Phase 2)
- Improved user experience across all transcription scenarios (Phase 3)

---

## Real-time Transcription Transport: SSE Implementation

### Problem: WebSocket Platform Incompatibility

**Initial Implementation Issue**:
The original `/v1/transcribe/live` and `/v1/transcribe/google-live` endpoints were built using WebSocket with `WebSocketPair` API, which is:
- **Cloudflare Workers specific** - not available in Node.js or Vercel
- **Platform-dependent** - fails silently on incompatible platforms
- **No error logging** - connections opened but transcripts never returned

**Root Cause**:
```typescript
// WebSocketPair is Cloudflare Workers API only
if (!(globalThis as any).WebSocketPair) {
  return new Response("WebSocket not supported on this platform", { status: 501 });
}
```

This check would fail on Vercel (our deployment platform) and localhost Node.js development servers.

### Solution: SSE + HTTP Hybrid Architecture

**Design Rationale**:
- ✅ **Platform-agnostic**: Works on Vercel, localhost, and any HTTP server
- ✅ **Already in use**: Existing codebase uses SSE extensively (session management, document import)
- ✅ **Simpler**: No complex WebSocket handshake or connection management
- ✅ **Native browser support**: `EventSource` API built into all modern browsers
- ✅ **Unidirectional streaming**: Perfect for server → client transcription results

**Architecture**:
1. **SSE Stream** (`/v1/transcribe/live-sse` GET): Server → Client transcription results
2. **HTTP POST** (`/v1/transcribe/live-sse/audio` POST): Client → Server audio chunks
3. **Session Correlation**: Unique session ID links SSE stream with audio submissions

### Implementation Details

#### SSE Stream Endpoint (`/v1/transcribe/live-sse/+server.ts`)

**Features**:
- Session-based correlation with unique UUIDs
- In-memory session management with `Map<sessionId, sessionState>`
- Audio chunk accumulation (1-second windows at 16kHz)
- Transcription processing when window size reached
- Automatic session cleanup (10-minute timeout)

**Session State**:
```typescript
const sessions = new Map<string, {
  controller: ReadableStreamDefaultController;  // SSE stream controller
  audioChunks: Float32Array[];                  // Accumulating audio
  processing: boolean;                          // Prevent concurrent processing
  lang?: string;                                // Language preference
  translate?: boolean;                          // Translation flag
  prompt?: string;                              // Custom prompt
  lastSeq: number;                              // Sequence number
  createdAt: number;                            // Timestamp for cleanup
}>();
```

**SSE Message Format**:
```typescript
// Initial connection
{ type: "connected", sessionId: "uuid-here" }

// Partial transcription (1-second chunks)
{ type: "partial", seq: 0, text: "Hello world", confidence: 0.8 }

// Final transcription (forced/complete)
{ type: "final", seq: 1, text: "Complete sentence.", confidence: 0.95 }

// Error
{ type: "error", message: "Transcription failed..." }
```

**Processing Strategy**:
- Accumulates Float32Array chunks until 16,000 samples (1 second at 16kHz)
- Converts to WAV format (16-bit PCM with proper headers)
- Uses existing `transcriptionProvider.transcribeAudioCompatible()` for consistency
- Sends `partial` results for streaming UX, `final` on session end

#### Audio Ingestion Endpoint (`/v1/transcribe/live-sse/audio/+server.ts`)

**Features**:
- Validates `sessionId` exists in active sessions
- Decodes base64 PCM audio (supports `f32` and `i16` formats)
- Updates session language/translation preferences dynamically
- Triggers processing when audio window is ready

**Request Format**:
```typescript
POST /v1/transcribe/live-sse/audio
Content-Type: application/json

{
  sessionId: "uuid-from-sse-connection",
  pcm: "base64-encoded-audio-data",
  seq: 0,                           // Optional sequence number
  lang: "cs",                        // Optional language
  translate: false,                  // Optional translation
  prompt: "Custom context...",       // Optional prompt
  final: false                       // Force final transcription
}
```

**Response**:
```json
{
  "success": true,
  "queuedSamples": 16000
}
```

#### Google Live SSE Variant (`/v1/transcribe/google-live-sse/`)

**Differences from Standard SSE**:
1. **Google Speech SDK Integration**: Uses `@google-cloud/speech` streaming API
2. **Stream Rotation**: Restarts Google stream every 4 minutes (API limit)
3. **Speaker Diarization**: Enables 2-speaker diarization with speaker tagging
4. **Enhanced Model**: Uses `latest_long` model with automatic punctuation
5. **Real-time Streaming**: Google processes audio incrementally, returns results faster

**Speaker Tagging**:
```typescript
// Maps numeric speaker tags to human-readable labels
const speakerMap = new Map<number, string>();
mapSpeakerTag(speakerMap, 1) → "S1"
mapSpeakerTag(speakerMap, 2) → "S2"
```

**Google Stream Configuration**:
```typescript
streamingRecognize({
  config: {
    encoding: "LINEAR16",
    sampleRateHertz: 16000,
    languageCode: "cs-CZ",
    enableAutomaticPunctuation: true,
    enableSpeakerDiarization: true,
    diarizationSpeakerCount: 2,
    model: "latest_long",
    useEnhanced: true
  },
  interimResults: true,      // Send partial results
  singleUtterance: false     // Continuous streaming
})
```

**Runtime Configuration**:
```typescript
export const config = {
  runtime: "nodejs"  // Required for Google SDK
};
```

### Client Implementation (`/src/routes/med/audio-test/+page.svelte`)

**Connection Flow**:
```typescript
// 1. Connect to SSE stream
liveEventSource = new EventSource('/v1/transcribe/live-sse');

// 2. Wait for connected message with sessionId
liveEventSource.addEventListener('message', (event) => {
  const payload = JSON.parse(event.data);
  if (payload.type === 'connected') {
    liveSessionId = payload.sessionId;  // Save for audio POST
  }
});

// 3. Send audio chunks via HTTP POST
const payload = {
  sessionId: liveSessionId,
  pcm: encodeFloat32ToInt16Base64(audioData),
  lang: 'cs',
  translate: false
};

await fetch('/v1/transcribe/live-sse/audio', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

// 4. Receive transcription results via SSE
liveEventSource.addEventListener('message', (event) => {
  const result = JSON.parse(event.data);
  if (result.type === 'partial' || result.type === 'final') {
    addTranscript(result.text, result.type);
  }
});

// 5. Close SSE on stop
liveEventSource.close();
```

**Graceful Fallback**:
```typescript
try {
  await connectLiveSSE();
  if (!liveSessionId) {
    throw new Error('Session not established');
  }
  // Send via SSE
} catch (err) {
  // Fallback to batch HTTP POST
  await transcribeChunkBatch(audioData);
}
```

**UI Updates**:
- Transport dropdown: "Live (SSE + HTTP)" and "Google Live (SSE + HTTP)"
- Status indicator: "SSE connected" / "SSE will connect on start"
- Log categories: "Live SSE" / "Google Live SSE"

### Advantages Over WebSocket

| Feature | WebSocket | SSE + HTTP |
|---------|-----------|------------|
| **Platform Support** | Platform-specific (Cloudflare) | Universal (HTTP) |
| **Localhost Dev** | ❌ Requires special setup | ✅ Works immediately |
| **Vercel Deployment** | ❌ Not supported | ✅ Fully supported |
| **Browser API** | `WebSocket` (manual reconnect) | `EventSource` (auto-reconnect) |
| **Connection Setup** | Complex handshake | Simple GET request |
| **Bidirectional** | ✅ Yes | ❌ Server→Client only |
| **Message Order** | ✅ Guaranteed | ✅ Guaranteed |
| **Existing Codebase** | ❌ New pattern | ✅ Already used |

**Why SSE is Sufficient**:
Our use case is **server → client streaming** (transcription results), with **client → server** handled via simple HTTP POST.
- Audio chunks sent via POST (no need for bidirectional)
- Transcription results streamed via SSE (server → client)
- Session correlation via UUID (no complex state management)

### Testing Checklist

**SSE Stream Endpoint**:
- [x] Session creation with unique UUID
- [x] Audio chunk accumulation (1-second windows)
- [x] Transcription processing triggers correctly
- [x] Partial and final messages sent
- [x] Session cleanup after 10 minutes
- [x] Error handling and error messages

**Audio Ingestion**:
- [x] SessionId validation
- [x] Base64 PCM decoding (f32 and i16)
- [x] Dynamic language/prompt updates
- [x] Processing trigger on audio ready
- [x] Error responses for invalid sessions

**Google Live SSE**:
- [x] Stream rotation every 4 minutes
- [x] Speaker diarization enabled
- [x] Language mapping (cs, en, de)
- [x] Interim and final results
- [x] Speaker tag mapping (1→S1, 2→S2)

**Client Integration**:
- [x] EventSource connection
- [x] Session ID capture from connected message
- [x] Audio POST with session ID
- [x] Transcription results display
- [x] Fallback to batch on SSE failure
- [x] Graceful SSE close on stop

### Performance Characteristics

**Latency**:
- **SSE Connection**: ~50-100ms initial setup
- **Audio POST**: ~20-50ms per chunk
- **Transcription**: 200-500ms (model-dependent)
- **SSE Message**: ~10-20ms delivery

**Scalability**:
- Sessions stored in-memory (Map)
- Automatic cleanup prevents memory leaks
- No persistent connections (EventSource reconnects automatically)
- Stateless audio POST (horizontal scaling friendly)

**Resource Usage**:
- ~2-5 KB per active session (audio buffers + metadata)
- Cleanup runs every 60 seconds
- Sessions auto-deleted after 10 minutes idle

### Production Deployment Notes

**Vercel Configuration**:
- No special configuration needed
- SSE works out-of-the-box on Vercel serverless functions
- HTTP POST compatible with all Vercel runtimes
- Google Live requires `runtime: "nodejs"` export

**Environment Variables** (Google Live only):
```bash
GCP_CLIENT_EMAIL=service@project.iam.gserviceaccount.com
GCP_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
GCP_PROJECT_ID=project-id
```

**Monitoring**:
- Log SSE connection events
- Track session creation/cleanup
- Monitor transcription latency
- Alert on high error rates

This SSE implementation provides a robust, platform-agnostic solution for real-time transcription that works seamlessly on localhost, Vercel, and any HTTP-based deployment environment.
